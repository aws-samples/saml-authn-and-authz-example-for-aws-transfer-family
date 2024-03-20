import * as path from 'path';
import {Duration} from 'aws-cdk-lib';
import {Architecture, Code, Function, IFunction, Runtime} from 'aws-cdk-lib/aws-lambda';

import {RetentionDays} from 'aws-cdk-lib/aws-logs';

import {Construct, Dependable, IDependable} from 'constructs';

import {Layers} from './Layers';
import {CognitoAuthorization} from "./CognitoAuthorization";
import {PolicyStatement} from "aws-cdk-lib/aws-iam";
import {ITableV2} from "aws-cdk-lib/aws-dynamodb";


export interface LambdasConfig {

	layers: Layers;
	cognitoAuthorization: CognitoAuthorization
	table: ITableV2
}


export class Lambdas extends Construct implements IDependable {

	readonly atfServerIdentityProvider: IFunction;
	readonly samlCallbackHandler: IFunction;
	readonly cognitoServiceProviderMetaDataHandler: IFunction
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
		this.identityProviderRouter = new Function(this, 'IdentityProviderRouter', {
			functionName: 'IdentityProviderRouter',
			handler: 'index.onEvent',
			code: Code.fromAsset(path.join(__dirname, '..', '..', 'dist', 'IdentityProviderRouter.zip')),
			environment: {
				LOG_LEVEL: "DEBUG",
				USER_POOL_ID: config.cognitoAuthorization.userPool.userPoolId,
				COGNITO_URL: config.cognitoAuthorization.cognitoDomain.baseUrl()
			},
			memorySize: 256,
			architecture: Architecture.ARM_64,
			timeout: Duration.seconds(30),
			runtime: Runtime.NODEJS_LATEST,
			logRetention: RetentionDays.ONE_DAY,
			layers: [
				config.layers.powerToolsLayer,
				config.layers.lambdasLayer
			],
			initialPolicy: [new PolicyStatement({
				actions: ["cognito-idp:DescribeIdentityProvider", "cognito-idp:DescribeUserPoolClient", "cognito-idp:ListUserPoolClients"],
				resources: [config.cognitoAuthorization.userPool.userPoolArn]
			})]


		});
		this.atfServerIdentityProvider = new Function(this, 'ATFServerIdentityProvider', {
			functionName: 'ATFServerIdentityProvider',
			handler: 'index.onEvent',
			code: Code.fromAsset(path.join(__dirname, '..', '..', 'dist', 'ATFServerIdentityProvider.zip')),
			environment: {
				LOG_LEVEL: "DEBUG",
				TABLE_NAME: config.table.tableName,
				USER_POOL_ID: config.cognitoAuthorization.userPool.userPoolId
			},
			memorySize: 256,
			architecture: Architecture.ARM_64,
			timeout: Duration.seconds(30),
			runtime: Runtime.NODEJS_LATEST,
			logRetention: RetentionDays.ONE_DAY,
			layers: [
				config.layers.powerToolsLayer,
				config.layers.lambdasLayer
			]

		});
		this.samlCallbackHandler = new Function(this, 'SamlCallbackHandler', {
			functionName: 'SamlCallbackHandler',
			handler: 'index.onEvent',
			code: Code.fromAsset(path.join(__dirname, '..', '..', 'dist', 'SamlCallbackHandler.zip')),
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
			layers: [
				config.layers.powerToolsLayer,
				config.layers.lambdasLayer
			],
			initialPolicy: [new PolicyStatement({
				actions: ["cognito-idp:DescribeUserPoolClient", "cognito-idp:ListUserPoolClients"],
				resources: [config.cognitoAuthorization.userPool.userPoolArn]
			})]

		});
		this.cognitoServiceProviderMetaDataHandler = new Function(this, 'CognitoServiceProviderMetaDataHandler', {
			functionName: 'CognitoServiceProviderMetaDataHandler',
			handler: 'index.onEvent',
			code: Code.fromAsset(path.join(__dirname, '..', '..', 'dist', 'CognitoServiceProviderMetaDataHandler.zip')),
			environment: {
				LOG_LEVEL: "DEBUG",
				POOL_ID: config.cognitoAuthorization.userPool.userPoolId,
				POOL_NAME: config.cognitoAuthorization.userPool.userPoolProviderName,
				POOL_URL: config.cognitoAuthorization.cognitoDomain.baseUrl()
			},
			memorySize: 256,
			architecture: Architecture.ARM_64,
			timeout: Duration.seconds(30),
			runtime: Runtime.NODEJS_LATEST,
			logRetention: RetentionDays.ONE_DAY,
			layers: [
				config.layers.powerToolsLayer,
				config.layers.lambdasLayer
			]

		});

		config.table.grantWriteData(this.samlCallbackHandler);
		config.table.grantReadData(this.atfServerIdentityProvider);
	}
}