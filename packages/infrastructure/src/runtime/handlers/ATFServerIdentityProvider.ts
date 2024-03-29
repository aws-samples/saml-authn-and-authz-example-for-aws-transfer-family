/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this
 * software and associated documentation files (the "Software"), to deal in the Software
 * without restriction, including without limitation the rights to use, copy, modify,
 * merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
 * PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
 * HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
 * OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
 * SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import { Logger } from "@aws-lambda-powertools/logger";
import { marshall } from "@aws-sdk/util-dynamodb";
import { CognitoJwtVerifier } from "aws-jwt-verify";
import { APIGatewayProxyEvent, Callback, Context } from "aws-lambda";
import { APIGatewayProxyResult } from "aws-lambda/trigger/api-gateway-proxy";
import { safeName } from "../../index";
import { APIGatewayProxyLambdaHandlerWithJwtVerifier, Aws, LambdaToolsWithJwtVerifier, Powertools, SimpleJwksCacheSingleton } from "../utils/";

const powertools = new Powertools({
  serviceName: "ATFServerIdentityProvider",
});

const READ_PERMISSIONS = ["s3:GetObject", "s3:GetObjectVersion", "s3:GetObjectACL"];
const WRITE_PERMISSIONS = ["s3:PutObject", "s3:DeleteObjectVersion", "s3:DeleteObject", "s3:PutObjectACL"];

enum HomeDirectoryType {
  PATH = "PATH",
  LOGICAL = "LOGICAL",
}

interface Response {
  Role: string;
  HomeDirectoryType: HomeDirectoryType;
  PublicKeys?: string[];
  Policy?: string;
  HomeDirectoryDetails?: string;
  HomeDirectory?: string;
}

interface DirectoryPermission {
  dir: string;
  permissions: string;
}

export const onEventHandler: APIGatewayProxyLambdaHandlerWithJwtVerifier<any> = async (
  event: APIGatewayProxyEvent,
  context: Context,
  _callback: Callback<APIGatewayProxyResult>,
  tools: LambdaToolsWithJwtVerifier<any> = {
    aws: Aws.instance({}, powertools),
    powertools,
    verifier: CognitoJwtVerifier.create(
      {
        userPoolId: process.env.USER_POOL_ID!,
      },
      {
        jwksCache: SimpleJwksCacheSingleton.instance(),
      },
    ),
  },
): Promise<APIGatewayProxyResult> => {
  // const {aws} = tools;
  let response: Response | undefined = undefined;
  const logger = tools.powertools.logger;
  logger.info(`Event: ${JSON.stringify(event)}`);
  const usernameValue = event.pathParameters?.username;
  const password = event.headers.Password;
  if (usernameValue == undefined) {
    throw new Error("No username specified");
  }
  if (password == undefined) {
    throw new Error("No password specified");
  }
  try {
    const username = decodeURIComponent(usernameValue);
    const auth = await tools.aws.getItem({
      TableName: process.env.TABLE_NAME!,
      Key: marshall({
        pk: username,
      }),
    });
    if (auth?.password === password) {
      //check the access token
      await tools.verifier.verify(auth.accessToken, {
        tokenUse: "access",
        clientId: auth.userPoolClientId,
      });
      logger.info(`Authenticated user ${username}`);
      const userInfo = auth.userInfo;
      const domain = `@${userInfo.email.split("@")[1]}`;
      const safeDomainName = safeName(domain);
      const accountId = context.invokedFunctionArn.split(":")[4];
      const region = context.invokedFunctionArn.split(":")[3];
      const bucketName = `atf-with-saml-${accountId}-${region}-${safeDomainName}`;
      const roleArn: string = `arn:aws:iam::${accountId}:role/atf-with-saml-role-${safeDomainName}`;
      const homeDir = JSON.parse(userInfo["custom:atf_home"]) as DirectoryPermission;

      const permissions = JSON.parse(userInfo["custom:atf_permissions"]) as DirectoryPermission[];
      logger.info(`Home directory ${JSON.stringify(homeDir)}`);
      logger.info(`Permissions ${JSON.stringify(permissions)}`);

      const sessionPolicy = {
        Version: "2012-10-17",
        Statement: [
          {
            Sid: "AllowListingOfTenantBucket",
            Action: ["s3:ListBucket"],
            Effect: "Allow",
            Resource: [`arn:aws:s3:::${bucketName}`],
            Condition: homeDirCondition(homeDir, permissions),
          },
          {
            Sid: "HomeDirObjectAccess",
            Effect: "Allow",
            Action: permissionToActions(homeDir, logger),
            Resource: homeDirResource(bucketName, homeDir),
          },
          ...permissionsToPolicyStatments(bucketName, permissions, logger),
        ],
      };
      const homeEntry = `/${cleanDir(homeDir.dir)}`;
      let homeDirectoryDetails = [
        {
          Entry: homeEntry,
          Target: `/${bucketName}/${cleanDir(homeDir.dir)}`,
        },
      ];
      /*
      You can't have overlapping paths
      https://docs.aws.amazon.com/transfer/latest/userguide/logical-dir-mappings.html#logical-dir-rules
       */
      if (homeEntry != "/") {
        permissions.forEach((permission) => {
          homeDirectoryDetails.push({
            Entry: `/${cleanDir(permission.dir)}`,
            Target: `/${bucketName}/${cleanDir(permission.dir)}`,
          });
        });
      }
      homeDirectoryDetails.forEach((value) => {
        if (value.Target.endsWith("/")) {
          //strip trailing slash
          value.Target = value.Target.substring(0, value.Target.length - 1);
        }
      });
      homeDirectoryDetails = removeOverlappingPaths(homeDirectoryDetails);
      response = {
        Role: roleArn,
        HomeDirectoryType: HomeDirectoryType.LOGICAL,
        HomeDirectoryDetails: JSON.stringify(homeDirectoryDetails),
        Policy: JSON.stringify(sessionPolicy),
      };
    } else {
      logger.error(`Invalid password for ${username}`);
    }
  } catch (e) {
    const error = e as Error;
    logger.error(`${error.name} - ${error.message}`);
  }
  const body = JSON.stringify(response);
  logger.info(`Sending response: ${body}`);
  return {
    statusCode: 200,
    body: body,
  };
};

function cleanDir(dir: string): string {
  let d = dir.replace(/(\.\.)\/?/g, "");
  if (d.startsWith("/")) {
    //strip the slash
    d = d.substring(1);
  }
  return d;
}

function permissionToActions(directoryPermission: DirectoryPermission, logger: Logger): string[] {
  const actions: string[] = [];
  const permissions = parsePermissions(directoryPermission, logger);
  permissions.map((value) => {
    switch (value) {
      case "r":
        actions.push(...READ_PERMISSIONS);
        break;
      case "w":
        actions.push(...WRITE_PERMISSIONS);
        break;
      default:
        logger.warn(`Invalid directory permissions specified for ${directoryPermission.dir}`);
    }
  });
  return actions;
}


function homeDirCondition(homeDir: DirectoryPermission, permissions: DirectoryPermission[]): { [key: string]: any } | undefined {
  const homeEntry = `/${cleanDir(homeDir.dir)}`;
  return homeEntry != "/"
    ? {
        StringLike: {
          "s3:prefix": permissionsToPrefixes([homeDir, ...permissions]),
        },
      }
    : undefined;
}

function removeOverlappingPaths(homeDirectoryDetails: any[]): any[] {
  const pathsToRemove = [];
  //remove overlapping paths
  for (const currentEntry of homeDirectoryDetails) {
    const overlappingPath = homeDirectoryDetails.find((value) => {
      return value.Entry != currentEntry.Entry && value.Entry.startsWith(currentEntry.Entry);
    });
    if (overlappingPath != undefined) {
      pathsToRemove.push(overlappingPath);
    }
  }
  //remove pathsToRemove from homeDirectoryDetails
  pathsToRemove.forEach((value) => {
    const index = homeDirectoryDetails.indexOf(value);
    if (index > -1) {
      homeDirectoryDetails.splice(index, 1);
    }
  });
  return homeDirectoryDetails;
}

function homeDirResource(bucketName: string, homeDir: DirectoryPermission): string {
  const homeEntry = `/${cleanDir(homeDir.dir)}`;
  return homeEntry == "/" ? `arn:aws:s3:::${bucketName}/*` : `arn:aws:s3:::${bucketName}${homeEntry}/*`;
}

function permissionsToPrefixes(directoryPermissions: DirectoryPermission[]): string[] {
  return directoryPermissions.flatMap(permissionToPrefix);
}

function permissionToPrefix(directoryPermission: DirectoryPermission): string[] {
  const prefixes = [`${cleanDir(directoryPermission.dir)}/*`, `${cleanDir(directoryPermission.dir)}`];
  return prefixes.filter((value) => {
    return value.length > 0;
  });
}

function permissionsToPolicyStatments(bucketName: string, directoryPermissions: DirectoryPermission[], logger: Logger): { [key: string]: any }[] {
  return directoryPermissions.map((permission) => permissionToPolicyStatment(bucketName, permission, logger));
}

function permissionToPolicyStatment(bucketName: string, directoryPermission: DirectoryPermission, logger: Logger): { [key: string]: any } {
  return {
    Effect: "Allow",
    Action: permissionToActions(directoryPermission, logger),
    Resource: `arn:aws:s3:::${bucketName}/${cleanDir(directoryPermission.dir)}/*`,
  };
}

function parsePermissions(directoryPermission: DirectoryPermission, logger: Logger): string[] {
  const permissions = [...directoryPermission.permissions];
  if (permissions.length > 2 || permissions.length < 1) {
    logger.warn(`Invalid directory permissions specified for ${directoryPermission.dir}`);
  }
  return permissions;
}

export const onEvent = powertools.wrap(onEventHandler);
