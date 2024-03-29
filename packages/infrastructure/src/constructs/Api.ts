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

import { RemovalPolicy } from "aws-cdk-lib";
import {
  AccessLogFormat,
  AuthorizationType,
  EndpointType,
  LambdaIntegration,
  LogGroupLogDestination,
  MethodLoggingLevel,
  RequestValidator,
  RestApi,
} from "aws-cdk-lib/aws-apigateway";
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs";
import { Construct, Dependable, IDependable } from "constructs";
import { Lambdas } from "./Lambdas";

export interface ApiConfig {
  apiName: string;
  lambdas: Lambdas;
}

export class Api extends Construct implements IDependable {
  private readonly api: RestApi;

  constructor(scope: Construct, id: string, config: ApiConfig) {
    super(scope, id);
    Dependable.implement(this, {
      dependencyRoots: [this],
    });
    this.api = this.createApi(config);
  }

  arnForExecuteApi(method?: string, path?: string, stage?: string): string {
    return this.api.arnForExecuteApi(method, path, stage);
  }

  protected createApi(config: ApiConfig): RestApi {
    const logGroup = new LogGroup(this, `${config.apiName}LogGroup`, {
      retention: RetentionDays.ONE_DAY,
      removalPolicy: RemovalPolicy.DESTROY,
      logGroupName: `/aws/apigw/${config.apiName}`,
    });
    const api = new RestApi(this, "Api", {
      endpointConfiguration: {
        types: [EndpointType.REGIONAL],
      },
      deploy: true,
      restApiName: config.apiName,
      deployOptions: {
        accessLogDestination: new LogGroupLogDestination(logGroup),
        accessLogFormat: AccessLogFormat.clf(),
        tracingEnabled: true,
        loggingLevel: MethodLoggingLevel.INFO,
        metricsEnabled: true,
      },
      defaultMethodOptions: {
        authorizationType: AuthorizationType.IAM,
      },
    });
    new RequestValidator(this, "DefaultRequestValidator", {
      requestValidatorName: "Default",
      restApi: api,
      validateRequestBody: true,
      validateRequestParameters: true,
    });
    const saml = api.root.addResource("saml", {});
    const samlCallback = saml.addResource("callback", {});
    const metadata = saml.addResource("metadata", {});
    const servers = api.root.addResource("servers", {});
    const serverId = servers.addResource("{serverId}", {});
    const users = serverId.addResource("users", {});
    const username = users.addResource("{username}", {});
    const configResource = username.addResource("config", {});
    const auth = api.root.addResource("auth", {});
    const authRoute = auth.addResource("route", {});

    configResource.addMethod(
      "GET",
      new LambdaIntegration(config.lambdas.atfServerIdentityProvider, {
        requestTemplates: {
          "application/json": `
				{
              "username": "$util.urlDecode($input.params('username'))",
              "password": "$util.escapeJavaScript($util.base64Decode($input.params('PasswordBase64'))).replaceAll("\\\\'","'")",
              "protocol": "$input.params('protocol')",
              "serverId": "$input.params('serverId')",
              "sourceIp": "$input.params('sourceIp')"
        }`,
        },
        integrationResponses: [
          {
            statusCode: "200",
          },
        ],
      }),
      {
        authorizationType: AuthorizationType.IAM,
        requestParameters: {
          "method.request.header.PasswordBase64": false,
          "method.request.querystring.protocol": false,
          "method.request.querystring.sourceIp": false,
        },
      },
    );
    metadata.addMethod("GET", new LambdaIntegration(config.lambdas.cognitoServiceProviderMetaDataHandler), {
      authorizationType: AuthorizationType.NONE,
    });
    samlCallback.addMethod("GET", new LambdaIntegration(config.lambdas.samlCallbackHandler, {}), {
      authorizationType: AuthorizationType.NONE,
      requestParameters: {
        "method.request.querystring.code": true,
        "method.request.querystring.state": true,
      },
    });
    authRoute.addMethod(
      "POST",
      new LambdaIntegration(config.lambdas.identityProviderRouter, {
        requestTemplates: {
          "application/json": `
				{
              "email": "$input.params('email')"
        }`,
        },
      }),
      {
        authorizationType: AuthorizationType.NONE,
      },
    );
    /**
     * The GET method is for demo purposes only. Do not send PII data such as email addresses as parameters in a GET request
     */
    authRoute.addMethod("GET", new LambdaIntegration(config.lambdas.identityProviderRouter, {}), {
      authorizationType: AuthorizationType.NONE,
      requestParameters: {
        "method.request.querystring.email": true,
      },
    });
    return api;
  }

  //getter for api execution endpoint
  urlForPath(path?: string): string {
    return this.api.deploymentStage.urlForPath(path);
  }
}
