import {Construct} from "constructs";
import {Effect, PolicyDocument, PolicyStatement, Role, ServicePrincipal} from "aws-cdk-lib/aws-iam";
import {CfnServer} from "aws-cdk-lib/aws-transfer";
import {CognitoAuthorization} from "./CognitoAuthorization";
import {Lambdas} from "./Lambdas";
import {Api} from "./Api";
import {BlockPublicAccess, Bucket, IBucket} from "aws-cdk-lib/aws-s3";
import {LogGroup, RetentionDays} from "aws-cdk-lib/aws-logs";
import {Aws, RemovalPolicy} from "aws-cdk-lib";
import {Layers} from "./Layers";
import {AwsCustomResource, AwsCustomResourcePolicy, PhysicalResourceId} from "aws-cdk-lib/custom-resources";
import {AttributeMapping, UserPoolIdentityProviderSaml, UserPoolIdentityProviderSamlMetadataType} from "aws-cdk-lib/aws-cognito";
import {AttributeType, TableV2} from "aws-cdk-lib/aws-dynamodb";

export interface SamlIdp {
	name: string,
	metadataUrl: string,
	attributeMap: AttributeMapping | undefined
}

export class ATFServerWithSaml extends Construct {
	private readonly cognitoAuthorization: CognitoAuthorization;
	private readonly lambdas: Lambdas;
	private readonly api: Api;
	private readonly bucket: IBucket

	constructor(scope: Construct, id: string) {
		super(scope, id);//create bucket for access logs
		//s3 bucket with an access logging bucket
		const accessLogsBucket = new Bucket(this, "AccessLogsBucket", {
			removalPolicy: RemovalPolicy.DESTROY,
			autoDeleteObjects: true,
			blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
			bucketName: `atf-with-saml-access-logs-${Aws.ACCOUNT_ID}-${Aws.REGION}`,
			enforceSSL: true
		});
		this.bucket = new Bucket(this, "TransferFamilyBucket", {
			removalPolicy: RemovalPolicy.DESTROY,
			autoDeleteObjects: true,
			blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
			bucketName: `atf-with-saml-${Aws.ACCOUNT_ID}-${Aws.REGION}`,
			serverAccessLogsBucket: accessLogsBucket,
			enforceSSL: true
		});
		const role = new Role(this, "ATFServerWithSamlS3AccessRole", {
			assumedBy: new ServicePrincipal("transfer.amazonaws.com"),
			roleName: "ATFServerWithSamlS3AccessRole",
			description: "Role for ATF Server With SAML to access S3 Bucket",
			inlinePolicies: {
				"0": new PolicyDocument({
					statements: [new PolicyStatement({
						sid: "AllowListingOfUserFolder",
						actions: ["s3:ListBucket",
							"s3:GetBucketLocation"],
						effect: Effect.ALLOW,
						resources: [this.bucket.bucketArn]
					}),
						new PolicyStatement({
							sid: "HomeDirObjectAccess",
							actions: ["s3:PutObject",
								"s3:GetObject",
								"s3:DeleteObject",
								"s3:DeleteObjectVersion",
								"s3:GetObjectVersion",
								"s3:GetObjectACL",
								"s3:PutObjectACL"],
							effect: Effect.ALLOW,
							resources: [this.bucket.arnForObjects("*")]

						})]
				})
			}
		})

		const serverLogGroup = new LogGroup(this, "ServerLogGroup", {
			removalPolicy: RemovalPolicy.DESTROY,
			retention: RetentionDays.ONE_DAY,
			logGroupName: `/aws/transfer/atf-with-saml-${Aws.ACCOUNT_ID}-${Aws.REGION}`
		})
		this.cognitoAuthorization = new CognitoAuthorization(this, "Cognito", {})
		const layers = new Layers(this, "Layers")
		const table = new TableV2(this, "Table", {
			removalPolicy: RemovalPolicy.DESTROY,
			timeToLiveAttribute: "ttl",
			partitionKey: {
				type: AttributeType.STRING,
				name: "pk"
			}
		})
		this.lambdas = new Lambdas(this, "Lambdas", {
			layers,
			cognitoAuthorization: this.cognitoAuthorization,
			table: table,
			bucketRole: role,
			bucketName: this.bucket.bucketName,
		})

		this.api = new Api(this, "Api", {
			lambdas: this.lambdas,
			apiName: "atf-with-saml-api"
		})

		const apiInvocationRole = new Role(this, "ApiInvocationRole", {
			roleName: "atf-with-saml-api-invocation-role",
			assumedBy: new ServicePrincipal("transfer.amazonaws.com"),
			inlinePolicies: {
				"ApiIdentityProvider": new PolicyDocument({
					statements: [new PolicyStatement({
						sid: "InvokeApi",
						effect: Effect.ALLOW,
						actions: ["execute-api:Invoke"],
						resources: [this.api.arnForExecuteApi()]
					}),
						new PolicyStatement({
							sid: "GetApi",
							effect: Effect.ALLOW,
							actions: ["apigateway:GET"],
							resources: ["*"]
						})]
				})
			}
		})

		const cfnServer = new CfnServer(this, "Server", {
			domain: "S3",
			endpointType: "PUBLIC",
			protocols: ["SFTP"],
			protocolDetails: {
				passiveIp: "AUTO",
				tlsSessionResumptionMode: "ENFORCED",
				setStatOption: "DEFAULT",
			},
			structuredLogDestinations: [
				serverLogGroup.logGroupArn
			],
			s3StorageOptions: {
				directoryListingOptimization: "ENABLED"
			},
			identityProviderDetails: {
				url: this.api.urlForPath(),
				sftpAuthenticationMethods: "PASSWORD",
				invocationRole: apiInvocationRole.roleArn
			},
			identityProviderType: "API_GATEWAY",
			preAuthenticationLoginBanner: "Welcome to the Transfer Family with SAML Server",
		})
		cfnServer.node.addDependency(this.api)
	}

	addSamlIdp(idp: SamlIdp) {
		//regex to validate that name is an email address
		const emailRegex = /^@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/;
		this.node.addValidation({
			validate(): string[] {
				const messages: string[] = [];
				if (!emailRegex.test(idp.name)) {
					messages.push("External IDP name must be and email domain @<domainName>.<tld>")
				}
				return messages;
			},
		});
		const safeName = idp.name.replace(/[^a-zA-Z0-9]/g, '');
		const identityProvider = new UserPoolIdentityProviderSaml(this, `${safeName}Idp`, {
			metadata: {
				metadataContent: idp.metadataUrl,
				metadataType: UserPoolIdentityProviderSamlMetadataType.URL
			},
			attributeMapping: idp.attributeMap,
			identifiers: [idp.name.replace("@", "")],
			name: idp.name,
			userPool: this.cognitoAuthorization.userPool,

		})
		this.cognitoAuthorization.addClient(idp.name, this.api.urlForPath("/saml/callback"), identityProvider)
		const createFolder = new AwsCustomResource(this, `${safeName}CreateFolder`, {
			onCreate: {
				service: 'S3',
				action: 'putObject',
				parameters: {
					Bucket: this.bucket.bucketName,
					Key: `${idp.name}/`,
				},
				physicalResourceId: PhysicalResourceId.of(`${safeName}CreateFolder`),
			},
			policy: AwsCustomResourcePolicy.fromSdkCalls({resources: AwsCustomResourcePolicy.ANY_RESOURCE}),
			installLatestAwsSdk: true,
		});
		createFolder.node.addDependency(this.bucket)

	}


}