import { Stack, StackProps } from "aws-cdk-lib";
import { NagSuppressions } from "cdk-nag";
import { Construct } from "constructs";
import { ATFServerWithSaml, SamlIdp } from "../constructs/ATFServerWithSaml";

export interface TransferFamilyWithSamlStackProps extends StackProps {
  samlIdps: SamlIdp[];
}

export class TransferFamilyWithSamlStack extends Stack {
  constructor(scope: Construct, id: string, props: TransferFamilyWithSamlStackProps) {
    super(scope, id, props);
    const server = new ATFServerWithSaml(this, "ATFServerWithSaml");
    props.samlIdps.forEach((value) => {
      server.addSamlIdp(value);
    });
    this.cdkNagSuppressions();
  }

  private cdkNagSuppressions() {
    NagSuppressions.addStackSuppressions(this, [
      {
        id: "AwsSolutions-L1",
        reason: "Manually managing runtimes",
      },
      {
        id: "AwsSolutions-IAM5",
        reason: "Wildcard permissions allowed because the roles are scope with conditions or account principals",
      },
      {
        id: "AwsSolutions-IAM4",
        reason: "Managed policies ok",
      },
      {
        id: "AwsSolutions-COG2",
        reason: "MFA not enabled for example",
      },
      {
        id: "AwsSolutions-APIG3",
        reason: "WAFv2 outside scope of example",
      },
    ]);

    NagSuppressions.addResourceSuppressionsByPath(this, `/${this.stackName}/ATFServerWithSaml/Api/Api/Default/saml/callback/GET/Resource`, [
      {
        id: "AwsSolutions-APIG4",
        reason: "SAML callback endpoint needs to be public",
      },
      {
        id: "AwsSolutions-COG4",
        reason: "SAML callback endpoint needs to be public",
      },
    ]);
    NagSuppressions.addResourceSuppressionsByPath(this, `/${this.stackName}/ATFServerWithSaml/Api/Api/Default/saml/metadata/GET/Resource`, [
      {
        id: "AwsSolutions-APIG4",
        reason: "SAML metadata endpoint needs to be public",
      },
      {
        id: "AwsSolutions-COG4",
        reason: "SAML metadata endpoint needs to be public",
      },
    ]);
    NagSuppressions.addResourceSuppressionsByPath(this, `/${this.stackName}/ATFServerWithSaml/Api/Api/Default/servers/{serverId}/users/{username}/config/GET/Resource`, [
      {
        id: "AwsSolutions-COG4",
        reason: "AWS Transfer Family Identity Provider endpoint uses IAM authentication",
      },
    ]);
    NagSuppressions.addResourceSuppressionsByPath(this, `/${this.stackName}/ATFServerWithSaml/Api/Api/Default/auth/route/POST/Resource`, [
      {
        id: "AwsSolutions-APIG4",
        reason: "Auth router endpoint needs to be public",
      },
      {
        id: "AwsSolutions-COG4",
        reason: "Auth router endpoint needs to be public",
      },
    ]);
    NagSuppressions.addResourceSuppressionsByPath(this, `/${this.stackName}/ATFServerWithSaml/Api/Api/Default/auth/route/GET/Resource`, [
      {
        id: "AwsSolutions-APIG4",
        reason: "Auth router endpoint needs to be public",
      },
      {
        id: "AwsSolutions-COG4",
        reason: "Auth router endpoint needs to be public",
      },
    ]);
  }
}
