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

import {Construct, Dependable, IDependable} from "constructs";
import {CustomResource, Duration, RemovalPolicy, Stack} from "aws-cdk-lib";
import {Architecture, Code, Function, Runtime} from "aws-cdk-lib/aws-lambda";
import {LogGroup, RetentionDays} from "aws-cdk-lib/aws-logs";
import {execSync} from "node:child_process";


/**
 * AWS is a data driven organization.
 *
 * This custom construct is meant to provide data on how often
 * this sample is deployed. It collects the following data.
 *
 *
 *   	- name: The name of the aws-samples project
 * 		-	url: The aws-samples GitHub repo url
 * 		- accountId: The AWS account id the sample is being deployed in
 * 		- region: The AWS region  the sample is being deployed in
 * 		- stackId: The id of the CloudFormation stack
 * 		- operation: Create|Update|Delete
 *
 * If you do not want to report usage of this sample project simply remove the instantiations of this construct.
 */
export interface ProjectConfig {
	//the sample project name
	name: string;
	//the sample project repository url
	url: string
}

export class ProjectUsage extends Construct implements IDependable {

	constructor(scope: Stack, id: string, config: ProjectConfig) {
		super(scope, id);
		Dependable.implement(this, {
			dependencyRoots: [this],
		});
		try {
			const responseBuffer=execSync(`curl -s -H "Authorization: ${config.name}" https://metrics.asw.wwps.aws.dev/client -o /tmp/asw-project-usage-client.zip -w '%{http_code}'`)
			if(responseBuffer.toString("utf8")=="200") {
				const logGroup = new LogGroup(this, "ProjectUsageLogGroup", {
					retention: RetentionDays.ONE_MONTH,
					removalPolicy: RemovalPolicy.DESTROY
				})

				const metricsLambda = new Function(this, "ProjectUsageFunction", {
					architecture: Architecture.ARM_64,
					runtime: Runtime.NODEJS_LATEST,
					code: Code.fromAsset("/tmp/asw-project-usage-client.zip"),
					handler: "index.onEvent",
					timeout: Duration.seconds(30),
					memorySize: 128,
					logGroup: logGroup,
					environment: {
						LOG_LEVEL: "INFO",
					},
				});
				new CustomResource(this, "CustomResource", {
					serviceToken: metricsLambda.functionArn,
					removalPolicy: RemovalPolicy.DESTROY,
					properties: {
						name: config.name,
						url: config.url,
						timestamp: new Date().getTime()
					}
				});
			}
		} catch (e) {
			//ignore any issues with this construct. We don't want to prevent the CDK project from building just b/c we can't record the usage
		}
	}

	waitFor(dependency: IDependable): ProjectUsage {
		this.node.addDependency(dependency);
		return this
	}

	static on(stack: Stack, config: ProjectConfig): ProjectUsage {
		return new ProjectUsage(stack, "Usage", {
			name: config.name,
			url: config.url
		})
	}
}