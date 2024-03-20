import {App} from 'aws-cdk-lib';
import {TransferFamilyWithSamlStack} from "./stacks/TransferFamilyWithSamlStack";
import {ProviderAttribute} from "aws-cdk-lib/aws-cognito";

;


// for development, use account/region from cdk cli
const devEnv = {
	account: process.env.CDK_DEFAULT_ACCOUNT,
	region: process.env.CDK_DEFAULT_REGION,
};

const app = new App();

new TransferFamilyWithSamlStack(app, 'aws-transfer-family-with-saml', {
	env: devEnv,
	samlIdps: [{
		name: "@institution01.edu",
		metadataUrl: "https://saml.institution01.awsgalen.com/simplesaml/module.php/saml/idp/metadata",
		attributeMap: {
			email: ProviderAttribute.other("mail"),
			givenName: ProviderAttribute.other("givenName"),
			familyName: ProviderAttribute.other("sn"),
			custom: {
				email_verified: ProviderAttribute.other("email_verified")
			}
		}
	},{
		name: "@institution02.edu",
		metadataUrl: "https://saml.institution02.awsgalen.com/simplesaml/module.php/saml/idp/metadata",
		attributeMap: {
			email: ProviderAttribute.other("mail"),
			givenName: ProviderAttribute.other("givenName"),
			familyName: ProviderAttribute.other("sn"),
			custom: {
				email_verified: ProviderAttribute.other("email_verified")
			}
		}
	}],
});
// new MyStack(app, 'aws-transfer-family-with-saml-prod', { env: prodEnv });

app.synth();