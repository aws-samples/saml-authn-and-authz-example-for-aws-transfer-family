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

import { App, Aspects } from "aws-cdk-lib";
import { AwsSolutionsChecks } from "cdk-nag";
import { TransferFamilyWithSamlStack } from "./stacks/TransferFamilyWithSamlStack";

// for development, use account/region from cdk cli
const devEnv = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

const app = new App();

new TransferFamilyWithSamlStack(app, "aws-transfer-family-with-saml", {
  env: devEnv,
  samlIdps: [
    //Add the configurations for your SAML IdPs here
    /*

    {
      name: "@institution01.example.com",
      metadataUrl: "https://<YOUR_SAML_IDP>/simplesaml/module.php/saml/idp/metadata",
      attributeMap: {
        email: ProviderAttribute.other("mail"),
        givenName: ProviderAttribute.other("givenName"),
        familyName: ProviderAttribute.other("sn"),
        custom: {
          email_verified: ProviderAttribute.other("email_verified"),
          "custom:atf_home": ProviderAttribute.other("atf_home"),
          "custom:atf_permissions": ProviderAttribute.other("atf_permissions"),
        },
      },
    },
    {
      name: "@institution02.example.com",
      metadataUrl: "https://<YOUR_SAML_IDP>/simplesaml/module.php/saml/idp/metadata",
      attributeMap: {
        email: ProviderAttribute.other("mail"),
        givenName: ProviderAttribute.other("givenName"),
        familyName: ProviderAttribute.other("sn"),
        custom: {
          email_verified: ProviderAttribute.other("email_verified"),
          "custom:atf_home": ProviderAttribute.other("atf_home"),
          "custom:atf_permissions": ProviderAttribute.other("atf_permissions"),
        },
      },
    },

    */
  ],
});

Aspects.of(app).add(new AwsSolutionsChecks());
app.synth();
