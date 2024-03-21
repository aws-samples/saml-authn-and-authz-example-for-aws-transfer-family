import { marshall } from "@aws-sdk/util-dynamodb";
import { CognitoJwtVerifier } from "aws-jwt-verify";
import { APIGatewayProxyEvent, Callback, Context } from "aws-lambda";
import { APIGatewayProxyResult } from "aws-lambda/trigger/api-gateway-proxy";
import { safeName } from "../../index";
import { APIGatewayProxyLambdaHandlerWithJwtVerifier, Aws, LambdaToolsWithJwtVerifier, Powertools, SimpleJwksCacheSingleton } from "../utils/";

const powertools = new Powertools({
  serviceName: "ATFServerIdentityProvider",
});

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
      const homeDirectoryDetails = [
        {
          Entry: "/",
          Target: `/${bucketName}`,
        },
      ];
      response = {
        Role: roleArn,
        HomeDirectoryType: HomeDirectoryType.LOGICAL,
        HomeDirectoryDetails: JSON.stringify(homeDirectoryDetails),
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

export const onEvent = powertools.wrap(onEventHandler);
