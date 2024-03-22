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
      name: "@institution01.edu",
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
      name: "@institution02.edu",
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
