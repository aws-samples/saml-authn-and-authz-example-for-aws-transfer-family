import { APIGatewayProxyEvent, Callback, Context } from "aws-lambda";
import { APIGatewayProxyResult } from "aws-lambda/trigger/api-gateway-proxy";

import {
  APIGatewayProxyLambdaHandler,
  Aws,
  BasicLambdaTools,
  Powertools,
} from "../utils/";

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

  const userPoolClient = await tools.aws.findUserPoolClient(
    `${providerName}-authorization-code-client`,
    process.env.USER_POOL_ID!
  );
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
  const request = new Request(tokenEndpoint, {
    body: formBody,
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });
  logger.info(`Request: ${JSON.stringify(request)}`);
  const response = await fetch(request);
  const body = await response.text();
  logger.info(`response: ${body}`);
  // const jwtPayload = jwtDecode(accessToken);
  // logger.info(`JWT Payload: ${JSON.stringify(jwtPayload)}`);
  // //@ts-ignore
  // const clientId = jwtPayload.client_id;
  // const jwtVerifier=CognitoJwtVerifier.create({
  //   userPoolId: process.env.USER_POOL_ID!,
  //   tokenUse: "access",
  //   clientId: process.env.USER_POOL_CLIENT_ID,
  // })
  return {
    statusCode: 200,
    body: body,
  };
};

export const onEvent = powertools.wrap(onEventHandler);
