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

import * as path from "path";
import { Duration } from "aws-cdk-lib";
import { ITableV2 } from "aws-cdk-lib/aws-dynamodb";
import { PolicyStatement } from "aws-cdk-lib/aws-iam";
import { Architecture, Code, Function, IFunction, Runtime } from "aws-cdk-lib/aws-lambda";

import { RetentionDays } from "aws-cdk-lib/aws-logs";

import { Construct, Dependable, IDependable } from "constructs";

import { CognitoAuthorization } from "./CognitoAuthorization";
import { Layers } from "./Layers";

export interface LambdasConfig {
  layers: Layers;
  cognitoAuthorization: CognitoAuthorization;
  table: ITableV2;
}

export class Lambdas extends Construct implements IDependable {
  readonly atfServerIdentityProvider: IFunction;
  readonly samlCallbackHandler: IFunction;
  readonly cognitoServiceProviderMetaDataHandler: IFunction;
  readonly identityProviderRouter: IFunction;

  constructor(scope: Construct, id: string, config: LambdasConfig) {
    super(scope, id);
    Dependable.implement(this, {
      dependencyRoots: [this],
    });
    this.node.addValidation({
      validate(): string[] {
        const messages: string[] = [];
        return messages;
      },
    });
    this.identityProviderRouter = new Function(this, "IdentityProviderRouter", {
      functionName: "IdentityProviderRouter",
      handler: "index.onEvent",
      code: Code.fromAsset(path.join(__dirname, "..", "..", "dist", "IdentityProviderRouter.zip")),
      environment: {
        LOG_LEVEL: "DEBUG",
        USER_POOL_ID: config.cognitoAuthorization.userPool.userPoolId,
        COGNITO_URL: config.cognitoAuthorization.cognitoDomain.baseUrl(),
      },
      memorySize: 256,
      architecture: Architecture.ARM_64,
      timeout: Duration.seconds(30),
      runtime: Runtime.NODEJS_LATEST,
      logRetention: RetentionDays.ONE_DAY,
      layers: [config.layers.powerToolsLayer, config.layers.lambdasLayer],
      initialPolicy: [
        new PolicyStatement({
          actions: ["cognito-idp:DescribeIdentityProvider", "cognito-idp:DescribeUserPoolClient", "cognito-idp:ListUserPoolClients"],
          resources: [config.cognitoAuthorization.userPool.userPoolArn],
        }),
      ],
    });
    this.atfServerIdentityProvider = new Function(this, "ATFServerIdentityProvider", {
      functionName: "ATFServerIdentityProvider",
      handler: "index.onEvent",
      code: Code.fromAsset(path.join(__dirname, "..", "..", "dist", "ATFServerIdentityProvider.zip")),
      environment: {
        LOG_LEVEL: "DEBUG",
        TABLE_NAME: config.table.tableName,
        USER_POOL_ID: config.cognitoAuthorization.userPool.userPoolId,
      },
      memorySize: 256,
      architecture: Architecture.ARM_64,
      timeout: Duration.seconds(30),
      runtime: Runtime.NODEJS_LATEST,
      logRetention: RetentionDays.ONE_DAY,
      layers: [config.layers.powerToolsLayer, config.layers.lambdasLayer],
    });
    this.samlCallbackHandler = new Function(this, "SamlCallbackHandler", {
      functionName: "SamlCallbackHandler",
      handler: "index.onEvent",
      code: Code.fromAsset(path.join(__dirname, "..", "..", "dist", "SamlCallbackHandler.zip")),
      environment: {
        LOG_LEVEL: "DEBUG",
        USER_POOL_ID: config.cognitoAuthorization.userPool.userPoolId,
        COGNITO_URL: config.cognitoAuthorization.cognitoDomain.baseUrl(),
        TABLE_NAME: config.table.tableName,
      },
      memorySize: 256,
      architecture: Architecture.ARM_64,
      timeout: Duration.seconds(30),
      runtime: Runtime.NODEJS_LATEST,
      logRetention: RetentionDays.ONE_DAY,
      layers: [config.layers.powerToolsLayer, config.layers.lambdasLayer],
      initialPolicy: [
        new PolicyStatement({
          actions: ["cognito-idp:DescribeUserPoolClient", "cognito-idp:ListUserPoolClients"],
          resources: [config.cognitoAuthorization.userPool.userPoolArn],
        }),
        new PolicyStatement({
          actions: ["secretsmanager:GetRandomPassword"],
          resources: ["*"],
        }),
      ],
    });
    this.cognitoServiceProviderMetaDataHandler = new Function(this, "CognitoServiceProviderMetaDataHandler", {
      functionName: "CognitoServiceProviderMetaDataHandler",
      handler: "index.onEvent",
      code: Code.fromAsset(path.join(__dirname, "..", "..", "dist", "CognitoServiceProviderMetaDataHandler.zip")),
      environment: {
        LOG_LEVEL: "DEBUG",
        POOL_ID: config.cognitoAuthorization.userPool.userPoolId,
        POOL_NAME: config.cognitoAuthorization.userPool.userPoolProviderName,
        POOL_URL: config.cognitoAuthorization.cognitoDomain.baseUrl(),
      },
      memorySize: 256,
      architecture: Architecture.ARM_64,
      timeout: Duration.seconds(30),
      runtime: Runtime.NODEJS_LATEST,
      logRetention: RetentionDays.ONE_DAY,
      layers: [config.layers.powerToolsLayer, config.layers.lambdasLayer],
    });

    config.table.grantWriteData(this.samlCallbackHandler);
    config.table.grantReadData(this.atfServerIdentityProvider);
  }
}
