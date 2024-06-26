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

import { marshall } from "@aws-sdk/util-dynamodb";
import { CognitoJwtVerifier } from "aws-jwt-verify";
import { APIGatewayProxyEvent, Callback, Context } from "aws-lambda";
import { APIGatewayProxyResult } from "aws-lambda/trigger/api-gateway-proxy";
import { APIGatewayProxyLambdaHandlerWithJwtVerifier, Aws, LambdaToolsWithJwtVerifier, Powertools, SimpleJwksCacheSingleton } from "../utils/";

const powertools = new Powertools({
  serviceName: "SamlCallbackHandler",
});

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
  const logger = tools.powertools.logger;
  try {
    logger.info(`Event: ${JSON.stringify(event)}`);
    logger.info(`Context: ${JSON.stringify(context)}`);
    const code = event.queryStringParameters?.code;

    if (code == undefined) {
      throw new Error("No code specified");
    }
    const state = event.queryStringParameters?.state;
    if (state == undefined) {
      throw new Error("No state specified");
    }
    const providerName: string | undefined = JSON.parse(atob(state)).providerName;
    if (providerName == undefined) {
      throw new Error("No provider name specified");
    } else {
      logger.info(`providerName: ${providerName}`);
    }

    const userPoolClient = await tools.aws.findUserPoolClient(`${providerName}-authorization-code-client`, process.env.USER_POOL_ID!);
    const clientId = userPoolClient?.ClientId;
    if (clientId == undefined) {
      throw new Error("No client id found");
    }
    // const clientSecret = userPooolClient?.ClientSecret;
    // const authorization = btoa(`${clientId}:${clientSecret}`);
    const tokenEndpoint = `${process.env.COGNITO_URL}/oauth2/token`;
    var formData: { [key: string]: any } = {
      grant_type: "authorization_code",
      client_id: clientId,
      code: code,
      redirect_uri: `https://${event.headers.Host}${event.requestContext.path}`,
    };
    const params = new URLSearchParams();
    for (const property in formData) {
      params.append(property, formData[property]);
    }
    const formBody = params.toString();
    const tokenRequest = new Request(tokenEndpoint, {
      body: formBody,
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });
    logger.info(`Request: ${JSON.stringify(tokenRequest)}`);
    const tokenResponse = await fetch(tokenRequest);
    const body = (await tokenResponse.json()) as Record<string, any>;
    logger.info(`Response: ${JSON.stringify(body)}`);
    const accessToken = body.access_token;
    const jwtPayload = await tools.verifier.verify(accessToken, {
      tokenUse: "access",
      clientId: clientId,
    });

    const userInfoEndpoint = `${process.env.COGNITO_URL}/oauth2/userInfo`;
    const userInfoRequest = new Request(userInfoEndpoint, {
      method: "GET",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Bearer ${accessToken}`,
      },
    });
    const userInfoResponse = await fetch(userInfoRequest);
    const userInfo = (await userInfoResponse.json()) as Record<string, any>;
    logger.info(`Response: ${JSON.stringify(userInfo)}`);
    const email = userInfo.email;
    logger.info(`Email: ${email}`);
    //generate a password
    const password = await tools.aws.getRandomPassword({
      PasswordLength: 9,
      IncludeSpace: false,
      ExcludePunctuation: true,
      RequireEachIncludedType: true,
    });
    if (password.RandomPassword == undefined) {
      throw new Error("Error generating temporary password generated");
    }
    await tools.aws.putItem({
      TableName: process.env.TABLE_NAME,
      Item: marshall({
        pk: `${email}`,
        password: password.RandomPassword,
        accessToken: accessToken,
        ttl: jwtPayload.exp,
        userPoolClientId: clientId,
        userInfo: userInfo,
      }),
    });

    return {
      headers: {
        "Content-Type": "application/json",
      },
      statusCode: 200,
      body: JSON.stringify({
        username: email,
        password: password,
        expires: jwtPayload.exp,
      }),
    };
  } catch (e) {
    const error = e as Error;
    logger.error(`${error.name} - ${error.message}`);
    return {
      headers: {
        "Cache-Control": "no-cache",
        "Content-Type": "application/json",
      },
      isBase64Encoded: false,
      statusCode: 500,
      body: JSON.stringify({
        error: {
          name: error.name,
          message: error.message,
        },
      }),
    };
  }
};

export const onEvent = powertools.wrap(onEventHandler);
