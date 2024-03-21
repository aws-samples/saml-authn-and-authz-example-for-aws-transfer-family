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

import { Aws, CfnOutput, Duration, RemovalPolicy } from "aws-cdk-lib";
import {
  AdvancedSecurityMode,
  CustomDomainOptions,
  OAuthScope,
  UserPool,
  UserPoolClientIdentityProvider,
  UserPoolDomain,
  UserPoolIdentityProviderSaml,
} from "aws-cdk-lib/aws-cognito";

import { CnameRecord, IHostedZone } from "aws-cdk-lib/aws-route53";
import { Construct, Dependable, IDependable } from "constructs";

export interface CognitoAuthorizationConfig {
  customDomain?: CustomDomainOptions;
  hostedZone?: IHostedZone;
}

export class CognitoAuthorization extends Construct implements IDependable {
  readonly userPool: UserPool;
  readonly customUserPoolDomain: UserPoolDomain | undefined;
  readonly cognitoDomain: UserPoolDomain;

  constructor(scope: Construct, id: string, config: CognitoAuthorizationConfig) {
    super(scope, id);
    Dependable.implement(this, {
      dependencyRoots: [this],
    });
    this.node.addValidation({
      validate(): string[] {
        const messages: string[] = [];
        if (config.customDomain != undefined && config.hostedZone == undefined) {
          messages.push("You must specify hostedZone if customDomain is set");
        }
        if (config.customDomain != undefined && config.hostedZone == undefined) {
          messages.push("You must specify customDomain if hostedZone is set");
        }
        return messages;
      },
    });
    const userPoolName = "ATFWithSamlUserPool";
    this.userPool = new UserPool(this, "UserPool", {
      userPoolName: userPoolName,
      advancedSecurityMode: AdvancedSecurityMode.ENFORCED,
      signInAliases: {
        email: true,
        username: false,
        preferredUsername: false,
        phone: false,
      },
      passwordPolicy: {
        minLength: 9,
        requireDigits: true,
        requireLowercase: true,
        requireSymbols: true,
        requireUppercase: true,
        tempPasswordValidity: Duration.days(1),
      },
      removalPolicy: RemovalPolicy.DESTROY,
    });

    this.cognitoDomain = this.userPool.addDomain("CognitoDomain", {
      cognitoDomain: {
        domainPrefix: `atf-with-saml-${Aws.ACCOUNT_ID}`,
      },
    });

    if (config.customDomain != undefined && config.hostedZone != undefined) {
      this.customUserPoolDomain = this.userPool.addDomain("CustomDomain", {
        customDomain: config.customDomain,
      });
      const cname = new CnameRecord(this, "AuthCnameRecord", {
        recordName: config.customDomain.domainName,
        zone: config.hostedZone,
        domainName: this.customUserPoolDomain.cloudFrontDomainName,
      });
      cname.node.addDependency(this.customUserPoolDomain);
      new CfnOutput(this, "UserPoolDomainBaseUrlOutput", {
        key: "UserPoolDomainBaseUrl",
        value: this.customUserPoolDomain.baseUrl(),
      });
    }
  }

  addClient(clientName: string, callbackUrl: string, identityProvider: UserPoolIdentityProviderSaml) {
    const clientScopes = [OAuthScope.OPENID, OAuthScope.EMAIL];
    this.userPool.addClient(`${clientName}AuthorizationCodeClient`, {
      authFlows: {
        userSrp: false,
        userPassword: true,
        adminUserPassword: false,
        custom: false,
      },
      userPoolClientName: `${clientName}-authorization-code-client`,
      supportedIdentityProviders: [UserPoolClientIdentityProvider.custom(identityProvider.providerName)],
      oAuth: {
        flows: {
          implicitCodeGrant: false,
          clientCredentials: false,
          authorizationCodeGrant: true,
        },
        scopes: clientScopes,
        callbackUrls: [callbackUrl],
      },
    });
  }
}
