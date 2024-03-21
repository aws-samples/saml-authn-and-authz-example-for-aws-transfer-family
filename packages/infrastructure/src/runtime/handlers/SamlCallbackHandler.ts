import { marshall } from "@aws-sdk/util-dynamodb";
import { APIGatewayProxyEvent, Callback, Context } from "aws-lambda";
import { APIGatewayProxyResult } from "aws-lambda/trigger/api-gateway-proxy";

import { jwtDecode } from "jwt-decode";
import { APIGatewayProxyLambdaHandler, Aws, BasicLambdaTools, Powertools } from "../utils/";

const powertools = new Powertools({
  serviceName: "SamlCallbackHandler",
});

export const onEventHandler: APIGatewayProxyLambdaHandler = async (
  event: APIGatewayProxyEvent,
  context: Context,
  _callback: Callback<APIGatewayProxyResult>,
  tools: BasicLambdaTools = {
    aws: Aws.instance({}, powertools),
    powertools,
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
    // const clientSecret = userPooolClient?.ClientSecret;
    // const authorization = btoa(`${clientId}:${clientSecret}`);
    const tokenEndpoint = `${process.env.COGNITO_URL}/oauth2/token`;
    var formData: { [key: string]: any } = {
      grant_type: "authorization_code",
      client_id: clientId,
      code: code,
      redirect_uri: `https://${event.headers.Host}${event.requestContext.path}`,
    };
    const formFields: string[] = [];
    for (var property in formData) {
      var encodedKey = encodeURIComponent(property);
      var encodedValue = encodeURIComponent(formData[property]);
      formFields.push(encodedKey + "=" + encodedValue);
    }
    const formBody = formFields.join("&");
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
    const jwtPayload = jwtDecode(accessToken);

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
    const password = tools.aws.generateRandomString(9);
    await tools.aws.putItem({
      TableName: process.env.TABLE_NAME,
      Item: marshall({
        pk: `${email}`,
        password: password,
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
