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

import { Aws, RemovalPolicy } from "aws-cdk-lib";
import { AttributeMapping, UserPoolIdentityProviderSaml, UserPoolIdentityProviderSamlMetadataType } from "aws-cdk-lib/aws-cognito";
import { AttributeType, TableV2 } from "aws-cdk-lib/aws-dynamodb";
import { Effect, PolicyDocument, PolicyStatement, Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs";
import { BlockPublicAccess, Bucket, IBucket } from "aws-cdk-lib/aws-s3";
import { CfnServer } from "aws-cdk-lib/aws-transfer";
import { Construct } from "constructs";
import { Api } from "./Api";
import { CognitoAuthorization } from "./CognitoAuthorization";
import { Lambdas } from "./Lambdas";
import { Layers } from "./Layers";
import { safeName } from "../index";

export interface SamlIdp {
  name: string;
  metadataUrl: string;
  attributeMap: AttributeMapping | undefined;
}

export class ATFServerWithSaml extends Construct {
  private readonly cognitoAuthorization: CognitoAuthorization;
  private readonly lambdas: Lambdas;
  private readonly api: Api;

  private accessLogsBucket: IBucket;

  constructor(scope: Construct, id: string) {
    super(scope, id); //create bucket for access logs

    this.accessLogsBucket = new Bucket(this, "AccessLogsBucket", {
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      bucketName: `atf-with-saml-access-logs-${Aws.ACCOUNT_ID}-${Aws.REGION}`,
      enforceSSL: true,
    });
    const serverLogGroup = new LogGroup(this, "ServerLogGroup", {
      removalPolicy: RemovalPolicy.DESTROY,
      retention: RetentionDays.ONE_DAY,
      logGroupName: `/aws/transfer/atf-with-saml-${Aws.ACCOUNT_ID}-${Aws.REGION}`,
    });
    this.cognitoAuthorization = new CognitoAuthorization(this, "Cognito", {});
    const layers = new Layers(this, "Layers");
    const table = new TableV2(this, "Table", {
      removalPolicy: RemovalPolicy.DESTROY,
      timeToLiveAttribute: "ttl",
      partitionKey: {
        type: AttributeType.STRING,
        name: "pk",
      },
    });
    this.lambdas = new Lambdas(this, "Lambdas", {
      layers,
      cognitoAuthorization: this.cognitoAuthorization,
      table: table,
    });

    this.api = new Api(this, "Api", {
      lambdas: this.lambdas,
      apiName: "atf-with-saml-api",
    });

    const apiInvocationRole = new Role(this, "ApiInvocationRole", {
      roleName: "atf-with-saml-api-invocation-role",
      assumedBy: new ServicePrincipal("transfer.amazonaws.com"),
      inlinePolicies: {
        ApiIdentityProvider: new PolicyDocument({
          statements: [
            new PolicyStatement({
              sid: "InvokeApi",
              effect: Effect.ALLOW,
              actions: ["execute-api:Invoke"],
              resources: [this.api.arnForExecuteApi()],
            }),
            new PolicyStatement({
              sid: "GetApi",
              effect: Effect.ALLOW,
              actions: ["apigateway:GET"],
              resources: ["*"],
            }),
          ],
        }),
      },
    });

    const cfnServer = new CfnServer(this, "Server", {
      domain: "S3",
      endpointType: "PUBLIC",
      protocols: ["SFTP"],
      protocolDetails: {
        passiveIp: "AUTO",
        tlsSessionResumptionMode: "ENFORCED",
        setStatOption: "DEFAULT",
      },
      structuredLogDestinations: [serverLogGroup.logGroupArn],
      s3StorageOptions: {
        directoryListingOptimization: "ENABLED",
      },
      identityProviderDetails: {
        url: this.api.urlForPath(),
        sftpAuthenticationMethods: "PASSWORD",
        invocationRole: apiInvocationRole.roleArn,
      },
      identityProviderType: "API_GATEWAY",
      preAuthenticationLoginBanner: "Welcome to the Transfer Family with SAML Server",
    });
    cfnServer.node.addDependency(this.api);
  }

  addSamlIdp(idp: SamlIdp) {
    //regex to validate that name is an email address
    const emailRegex = /^@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/;
    this.node.addValidation({
      validate(): string[] {
        const messages: string[] = [];
        if (!emailRegex.test(idp.name)) {
          messages.push("External IDP name must be and email domain @<domainName>.<tld>");
        }
        return messages;
      },
    });
    const safeIdpName = safeName(idp.name);
    const idpBucket = new Bucket(this, `${safeIdpName}TransferFamilyBucket`, {
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      bucketName: `atf-with-saml-${Aws.ACCOUNT_ID}-${Aws.REGION}-${safeIdpName}`,
      serverAccessLogsBucket: this.accessLogsBucket,
      enforceSSL: true,
    });
    new Role(this, `${safeIdpName}ATFServerWithSamlS3AccessRole`, {
      assumedBy: new ServicePrincipal("transfer.amazonaws.com"),
      roleName: `atf-with-saml-role-${safeIdpName}`,
      description: `Role for ATF Server With SAML to access ${idpBucket.bucketName}`,
      inlinePolicies: {
        "0": new PolicyDocument({
          statements: [
            new PolicyStatement({
              sid: "AllowListingOfUserFolder",
              actions: ["s3:ListBucket", "s3:GetBucketLocation"],
              effect: Effect.ALLOW,
              resources: [idpBucket.bucketArn],
            }),
            new PolicyStatement({
              sid: "HomeDirObjectAccess",
              actions: ["s3:PutObject", "s3:GetObject", "s3:DeleteObject", "s3:DeleteObjectVersion", "s3:GetObjectVersion", "s3:GetObjectACL", "s3:PutObjectACL"],
              effect: Effect.ALLOW,
              resources: [idpBucket.arnForObjects("*")],
            }),
          ],
        }),
      },
    });
    const identityProvider = new UserPoolIdentityProviderSaml(this, `${safeIdpName}Idp`, {
      metadata: {
        metadataContent: idp.metadataUrl,
        metadataType: UserPoolIdentityProviderSamlMetadataType.URL,
      },
      attributeMapping: idp.attributeMap,
      identifiers: [idp.name.replace("@", "")],
      name: idp.name,
      userPool: this.cognitoAuthorization.userPool,
    });
    this.cognitoAuthorization.addClient(idp.name, this.api.urlForPath("/saml/callback"), identityProvider);
  }
}
