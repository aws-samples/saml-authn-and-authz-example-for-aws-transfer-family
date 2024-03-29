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
import { APIGatewayProxyEvent, Callback, Context } from "aws-lambda";
import { APIGatewayProxyResult } from "aws-lambda/trigger/api-gateway-proxy";
import { APIGatewayProxyLambdaHandler, Aws, BasicLambdaTools, Powertools } from "../utils/";

const powertools = new Powertools({
  serviceName: "IdentityProviderRouter",
});
/**
 * This lambda routes to the correct IdP base on the email address submitted
 *
 *
 * @param event
 * @param _context
 * @param _callback
 * @param tools
 */
export const onEventHandler: APIGatewayProxyLambdaHandler = async (
  event: APIGatewayProxyEvent,
  _context: Context,
  _callback: Callback<APIGatewayProxyResult>,
  tools: BasicLambdaTools = {
    aws: Aws.instance({}, powertools),
    powertools,
  },
): Promise<APIGatewayProxyResult> => {
  // const {aws} = tools;
  const logger = tools.powertools.logger;
  logger.info(`Event: ${JSON.stringify(event)}`);
  let email: string | undefined = undefined;
  let returnApplicationJson: boolean = false;
  let response: APIGatewayProxyResult = {
    statusCode: 404,
    body: "Unknown",
  };
  if (event.httpMethod == "GET") {
    email = event.queryStringParameters?.email;
  } else if (event.body != undefined) {
    returnApplicationJson = true;
    const body = JSON.parse(event.body);
    email = body.email;
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (email != undefined && emailRegex.test(email)) {
    const providerName = `@${email.split("@")[1]}`;
    logger.info(`Looking for Idp for ${providerName}`);
    try {
      const describeIdentityProviderResponse = await tools.aws.describeIdentityProvider({
        ProviderName: providerName,
        UserPoolId: process.env.USER_POOL_ID!,
      });
      if (describeIdentityProviderResponse.IdentityProvider != undefined) {
        logger.info(`Found Idp ${describeIdentityProviderResponse.IdentityProvider?.ProviderName}`);

        try {
          const userPoolClient = await tools.aws.findUserPoolClient(`${providerName}-authorization-code-client`, process.env.USER_POOL_ID!);

          if (userPoolClient != undefined && userPoolClient.CallbackURLs != undefined) {
            logger.info(`Found App Client ${userPoolClient.ClientName} details`);
            const callbackUrl = userPoolClient.CallbackURLs[0];
            const clientId = userPoolClient.ClientId!;
            response = redirectToLogin(providerName, clientId, "openid", callbackUrl, returnApplicationJson, logger);
          } else {
            response = noAppClientFound(providerName, returnApplicationJson, logger);
          }
        } catch (e) {
          const error = e as Error;
          if (error.name == "ResourceNotFoundException") {
            response = noAppClientFound(providerName, returnApplicationJson, logger);
          } else {
            response = errorResponse(error, returnApplicationJson, logger);
          }
        }
      } else {
        response = noIdpFound(providerName, returnApplicationJson, logger);
      }
    } catch (e) {
      const error = e as Error;
      if (error.name == "ResourceNotFoundException") {
        response = noIdpFound(providerName, returnApplicationJson, logger);
      } else {
        response = errorResponse(error, returnApplicationJson, logger);
      }
    }
  } else {
    response = noEmailResponse(returnApplicationJson, logger);
  }
  //@ts-ignore
  return response;
};

function errorResponse(error: Error, returnApplicationJson: boolean, logger: Logger): APIGatewayProxyResult {
  logger.error(`${error.name} - ${error.message}`);
  if (returnApplicationJson) {
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
  } else {
    return {
      isBase64Encoded: false,
      statusCode: 500,
      body: `${error.name} - ${error.message}`,
    };
  }
}

function redirectToLogin(providerName: string, clientId: string, scope: string, callbackUrl: string, returnApplicationJson: boolean, logger: Logger): APIGatewayProxyResult {
  const state = btoa(
    JSON.stringify({
      providerName: providerName,
    }),
  );
  var queryParams: { [key: string]: any } = {
    identity_provider: providerName,
    response_type: "code",
    client_id: clientId,
    scope: scope,
    redirect_uri:callbackUrl,
    state:state
  };

  const location = new URL(`${process.env.COGNITO_URL}/oauth2/authorize`);
  for (const property in queryParams) {
    location.searchParams.append(property, queryParams[property]);
  }

  logger.info(`Redirecting to login for ${providerName}: ${location.toString()}`);
  if (returnApplicationJson) {
    return {
      headers: {
        "Cache-Control": "no-cache",
        "Content-Type": "application/json",
      },
      isBase64Encoded: false,
      statusCode: 302,
      body: JSON.stringify({
        location: location.toString(),
      }),
    };
  } else {
    return {
      isBase64Encoded: false,
      statusCode: 302,
      body: "Redirecting to login for " + providerName,
      headers: {
        "Cache-Control": "no-cache",
        "Content-Type": "text/html",
        Location: location.toString(),
      },
    };
  }
}

function noAppClientFound(providerName: string, returnApplicationJson: boolean, logger: Logger): APIGatewayProxyResult {
  logger.warn(`No app client found for ${providerName}`);
  if (returnApplicationJson) {
    return {
      headers: {
        "Cache-Control": "no-cache",
        "Content-Type": "application/json",
      },
      isBase64Encoded: false,
      statusCode: 404,
      body: JSON.stringify({
        message: "No app client found for " + providerName,
      }),
    };
  } else {
    return {
      headers: {
        "Cache-Control": "no-cache",
        "Content-Type": "text/html",
      },
      isBase64Encoded: false,
      statusCode: 404,
      body: "No app client found for " + providerName,
    };
  }
}

function noIdpFound(providerName: string, returnApplicationJson: boolean, logger: Logger): APIGatewayProxyResult {
  logger.warn(`No Idp found for ${providerName}`);
  if (returnApplicationJson) {
    return {
      headers: {
        "Cache-Control": "no-cache",
        "Content-Type": "application/json",
      },
      isBase64Encoded: false,
      statusCode: 404,
      body: JSON.stringify({
        message: "No Idp found for " + providerName,
      }),
    };
  } else {
    return {
      headers: {
        "Cache-Control": "no-cache",
        "Content-Type": "text/html",
      },
      isBase64Encoded: false,
      statusCode: 404,
      body: "No Idp found for " + providerName,
    };
  }
}

function noEmailResponse(returnApplicationJson: boolean, logger: Logger): APIGatewayProxyResult {
  logger.warn("Invalid email");
  if (returnApplicationJson) {
    return {
      headers: {
        "Cache-Control": "no-cache",
        "Content-Type": "application/json",
      },
      isBase64Encoded: false,
      statusCode: 400,
      body: JSON.stringify({
        message: "You must enter a valid email address",
      }),
    };
  } else {
    return {
      headers: {
        "Cache-Control": "no-cache",
        "Content-Type": "text/html",
      },
      isBase64Encoded: false,
      statusCode: 400,
      body: "You must enter a valid email address",
    };
  }
}

export const onEvent = powertools.wrap(onEventHandler);
