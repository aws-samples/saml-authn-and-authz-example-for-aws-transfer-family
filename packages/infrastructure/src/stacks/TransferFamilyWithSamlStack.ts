import {Stack, StackProps} from "aws-cdk-lib";
import {Construct} from "constructs";
import {ATFServerWithSaml, SamlIdp} from "../constructs/ATFServerWithSaml";

export interface TransferFamilyWithSamlStackProps extends StackProps {
	samlIdps: SamlIdp[];
}

export class TransferFamilyWithSamlStack extends Stack {


	constructor(scope: Construct, id: string, props: TransferFamilyWithSamlStackProps) {
		super(scope, id, props);
		const server = new ATFServerWithSaml(this, "ATFServerWithSaml")
		props.samlIdps.forEach(value => {
			server.addSamlIdp(value)
		})

	}
}