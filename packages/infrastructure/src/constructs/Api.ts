import {LogGroup, RetentionDays} from "aws-cdk-lib/aws-logs";
import {Construct, Dependable, IDependable} from "constructs";
import {Lambdas} from "./Lambdas";
import {RemovalPolicy, ResourceEnvironment, Stack} from "aws-cdk-lib";
import {AccessLogFormat, AuthorizationType, EndpointType, IResource, LambdaIntegration, LogGroupLogDestination, Method, MethodLoggingLevel, RestApi, Stage} from "aws-cdk-lib/aws-apigateway";


export interface ApiConfig {
	apiName: string;
	lambdas: Lambdas
}

export class Api extends Construct implements IDependable {
	arnForExecuteApi(method?: string, path?: string, stage?: string): string {
		return this.api.arnForExecuteApi(method, path, stage);
	}

	get restApiId(): string {
		return this.restApiId;
	}


	get methods(): Method[] {
		return this.methods;
	}


	get env(): ResourceEnvironment {
		return this.env;
	}


	get deploymentStage(): Stage {
		return this.deploymentStage;
	}


	get restApiName(): string {
		return this.restApiName;
	}


	get root(): IResource {
		return this.root;
	}


	get restApiRootResourceId(): string {
		return this.restApiRootResourceId;
	}


	get stack(): Stack {
		return this.stack;
	}


	private readonly api: RestApi


	constructor(scope: Construct, id: string, config: ApiConfig) {
		super(scope, id);
		Dependable.implement(this, {
			dependencyRoots: [this],
		});
		this.api = this.createApi(config);


	}

	protected createApi(
		config: ApiConfig,
	): RestApi {
		const logGroup = new LogGroup(this, `${config.apiName}LogGroup`, {
			retention: RetentionDays.ONE_DAY,
			removalPolicy: RemovalPolicy.DESTROY,
			logGroupName: `/aws/apigw/${config.apiName}`,
		});
		const api = new RestApi(this, 'Api', {

			endpointConfiguration: {
				types: [EndpointType.REGIONAL]
			},
			deploy: true,
			restApiName: config.apiName,
			deployOptions: {
				accessLogDestination: new LogGroupLogDestination(logGroup),
				accessLogFormat: AccessLogFormat.clf(),
				tracingEnabled: true,
				loggingLevel: MethodLoggingLevel.INFO,
				metricsEnabled: true
			},
			defaultMethodOptions: {
				authorizationType: AuthorizationType.IAM
			},


		});
		const saml = api.root.addResource("saml", {})
		const samlCallback = saml.addResource("callback", {})
		const metadata = api.root.addResource("metadata", {})
		const servers = api.root.addResource("servers", {})
		const serverId = servers.addResource("{serverId}", {})
		const users = serverId.addResource("users", {})
		const username = users.addResource("{username}", {})
		const configResource = username.addResource("config", {})
		const auth = api.root.addResource("auth", {})
		const authRoute = auth.addResource("route", {})

		configResource.addMethod("GET", new LambdaIntegration(config.lambdas.atfServerIdentityProvider, {
			requestTemplates: {
				"application/json": `
				{
              "username": "$util.urlDecode($input.params('username'))",
              "password": "$util.escapeJavaScript($util.base64Decode($input.params('PasswordBase64'))).replaceAll("\\\\'","'")",
              "protocol": "$input.params('protocol')",
              "serverId": "$input.params('serverId')",
              "sourceIp": "$input.params('sourceIp')"
        }`
			},
			integrationResponses: [{
				statusCode: "200",
			}]
		}), {

			requestParameters: {
				"method.request.header.PasswordBase64": false,
				"method.request.querystring.protocol": false,
				"method.request.querystring.sourceIp": false
			},

		})
		metadata.addMethod("GET", new LambdaIntegration(config.lambdas.cognitoServiceProviderMetaDataHandler), {
			authorizationType: AuthorizationType.NONE
		})
		samlCallback.addMethod("GET", new LambdaIntegration(config.lambdas.samlCallbackHandler, {}), {
			authorizationType: AuthorizationType.NONE,
			requestParameters: {
				"method.request.querystring.code": true,
				"method.request.querystring.state": true
			}
		})
		authRoute.addMethod("POST", new LambdaIntegration(config.lambdas.identityProviderRouter, {
			requestTemplates: {
				"application/json": `
				{
              "email": "$input.params('email')"
        }`
			},
		}), {
			authorizationType: AuthorizationType.NONE,
		})
		authRoute.addMethod("GET", new LambdaIntegration(config.lambdas.identityProviderRouter, {}), {
			authorizationType: AuthorizationType.NONE,
			requestParameters: {
				"method.request.querystring.email": true,
			}
		})
		return api;
	}

	//getter for api execution endpoint
	urlForPath(path?: string): string {
		return this.api.deploymentStage.urlForPath(path);
	}


}
