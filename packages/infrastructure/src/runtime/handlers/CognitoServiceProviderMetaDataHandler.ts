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

import { APIGatewayProxyEvent, Callback, Context } from "aws-lambda";
import { APIGatewayProxyResult } from "aws-lambda/trigger/api-gateway-proxy";
import { APIGatewayProxyLambdaHandler, Aws, BasicLambdaTools, Powertools } from "../utils/";

const powertools = new Powertools({
  serviceName: "CognitoServiceProviderMetaDataHandler",
});
/**
 * Cognito does not provide a convenient way to get SAML SP Metadata for a user pool.
 * This lambda fills that gap.
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
  return {
    isBase64Encoded: false,
    statusCode: 200,
    body: `<?xml version="1.0"?>
<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" entityID="urn:amazon:cognito:sp:${process.env.POOL_ID!}">
    <md:SPSSODescriptor AuthnRequestsSigned="false" protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
        <md:NameIDFormat>urn:oasis:names:tc:SAML:2.0:nameid-format:persistent</md:NameIDFormat>
        <md:AssertionConsumerService
Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
Location="${process.env.POOL_URL}/saml2/idpresponse"
index="1"/>
        <md:AttributeConsumingService index="1">
            <md:ServiceName xml:lang="en">${process.env.POOL_NAME!}</md:ServiceName>
            <md:RequestedAttribute FriendlyName="givenName" Name="urn:oid:2.5.4.42"/>
            <md:RequestedAttribute FriendlyName="sn" Name="urn:oid:2.5.4.4"/>
            <md:RequestedAttribute FriendlyName="mail" Name="urn:oid:0.9.2342.19200300.100.1.3"/>
            <md:RequestedAttribute FriendlyName="email_verified" Name="urn:custom:email_verified"/>
            <md:RequestedAttribute FriendlyName="atf_home" Name="urn:custom:atf:home"/>
            <md:RequestedAttribute FriendlyName="atf_permissions" Name="urn:custom:atf:permissions"/>
        </md:AttributeConsumingService>
    </md:SPSSODescriptor>
</md:EntityDescriptor>`,
    headers: {
      "content-type": "application/xml",
    },
  };
};

export const onEvent = powertools.wrap(onEventHandler);
