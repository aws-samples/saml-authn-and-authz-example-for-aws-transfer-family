import {awscdk, javascript} from 'projen';
import {execSync} from "child_process";
import {ReleaseTrigger} from "projen/lib/release";

import {TypeScriptProject} from "projen/lib/typescript";
// @ts-ignore
import {PnpmWorkspace} from "./projenrc/pnpm";
// @ts-ignore
import {Nx} from "./projenrc/nx";
import {NodeProject, TypeScriptModuleResolution} from "projen/lib/javascript";
// @ts-ignore
import {zipLambdaFunction, zipRuntime} from "./projenrc/utils";
import {TaskStep} from "projen/lib/task-model";

const defaultReleaseBranch = 'main';
const cdkVersion = `${execSync("npm show 'aws-cdk-lib' version")}`.trim();
const nodeVersion = '20.11.1';
const pnpmVersion = '8.15.3';
const jsiiReleaseVersion = "1.94.0";
const namespace = "@aws-transfer-family-with-saml"
const main = async () => {
	const root = new TypeScriptProject({
		name: `${namespace}/root`,
		defaultReleaseBranch,
		packageManager: javascript.NodePackageManager.PNPM,
		projenCommand: 'pnpm dlx projen',
		minNodeVersion: nodeVersion,
		projenrcTs: true,
		sampleCode: false,
		licensed: false,
		tsconfig: {
			compilerOptions: {
				target: "ES2022",
				lib: ["ES2022"],
			},
			include: ["projen/**/*.ts"],
		},
		prettierOptions: {
			settings: {
				printWidth: 120,
			},
		},
		gitignore: [".DS_Store", ".idea", "*.iml", ".$*", "appsec"],
		// Jest and eslint are disabled at the root as they will be
		// configured by each subproject. Using a single jest/eslint
		// config at the root is out of scope for this walkthrough
		eslint: false,
		jest: false,

		// Disable default github actions workflows generated
		// by projen as we will generate our own later (that uses nx)
		depsUpgradeOptions: {workflow: false},
		buildWorkflow: false,
		release: false,
		devDeps: [
			"@npmcli/arborist",
			"@types/npm-packlist",
			"@types/npmcli__arborist"
		]
	});

	const infrastructure = new awscdk.AwsCdkTypeScriptApp({
		name: `infrastructure`,
		packageName: `${namespace}/infrastructure`,
		jsiiReleaseVersion,
		outdir: './packages/infrastructure',
		parent: root,
		cdkVersion,
		defaultReleaseBranch,

		packageManager: root.package.packageManager,
		projenCommand: root.projenCommand,
		minNodeVersion: root.minNodeVersion,
		projenrcTs: true,
		sampleCode: false,
		licensed: false,
		jest: false,
		github: false,
		eslint: true,
		requireApproval: awscdk.ApprovalLevel.NEVER,
		appEntrypoint: "main.ts",
		tsconfig: {
			compilerOptions: {
				target: "ESNext",
				esModuleInterop: true,
				allowSyntheticDefaultImports: true,
				moduleResolution: TypeScriptModuleResolution.BUNDLER,
				strict: true,
				noEmit: true,
				isolatedModules: true,
			},

		},
		eslintOptions: {
			prettier: true,
			dirs: ["src/runtime"],
			devdirs: ["src/infrastructure", "test"],
			ignorePatterns: ["test/*"],
		},
		prettierOptions: {
			settings: {
				printWidth: 120,
			},
		},
		releaseTrigger: ReleaseTrigger.manual({}),
		majorVersion: 0,
		deps: [
			"@middy/core@4.7.0",
			"aws-jwt-verify",
			"@aws-crypto/sha256-js",
			"@aws-lambda-powertools/logger",
			"@aws-lambda-powertools/metrics",
			"@aws-lambda-powertools/tracer",
			"@aws-sdk/client-cognito-identity-provider",
			"@aws-sdk/client-dynamodb",
			"@aws-sdk/client-ssm",
			"@aws-sdk/util-dynamodb",
			"@aws-sdk/types",
			"@smithy/node-http-handler",
			"@smithy/protocol-http",
			"@smithy/signature-v4",
			"@smithy/types",
			"aws-xray-sdk",
			"@types/aws-lambda",
			"jwt-decode"
		] /* Runtime dependencies of this module. */,
		// description: undefined,  /* The description is just a string that helps people understand the purpose of the package. */
		devDeps: [

			"aws-cdk-lib",
			"cdk-assets",
			"cdk-nag",
			"sinon",
			"@types/sinon",
			"vitest"
		]
	});
	new PnpmWorkspace(root);
	new Nx(root); // add nx to root
	root.package.addField('packageManager', `pnpm@${pnpmVersion}`);
	root.npmrc.addConfig('auto-install-peers', 'true');
	root.tasks.addTask("nx", {
		receiveArgs: true
	});
	root.tasks.addTask("deploy", {
		receiveArgs: true
	});
	root.tasks.addTask("destroy", {
		receiveArgs: true
	});

	[infrastructure].forEach(value => {
		root.tasks.tryFind("nx")?.exec(`nx build ${value.package.packageName}`, {
			receiveArgs: true
		})
	});
	[infrastructure].forEach(value => {
		root.tasks.tryFind("deploy")?.exec(`nx deploy ${value.package.packageName}`, {
			receiveArgs: true
		})
		root.tasks.tryFind("destroy")?.exec(`nx destroy ${value.package.packageName}`, {
			receiveArgs: true
		})
	});
	await zipRuntime(infrastructure, [
		"@aws-verified-permissions-example",
		"@aws-lambda-powertools",
		"@aws-sdk",
		"@smithy",
		"@types",
		"constructs"], (p: NodeProject, esBuildExternal: string) => {
		const steps: TaskStep[] = [
			{
				exec: 'rm -Rf ./lib/runtime',
				cwd: p.outdir
			},
			{
				exec: 'mkdir ./dist',
				cwd: p.outdir
			},
			...zipLambdaFunction("src/runtime/handlers/ATFServerIdentityProvider.ts",esBuildExternal),
			...zipLambdaFunction("src/runtime/handlers/SamlCallbackHandler.ts",esBuildExternal),
			...zipLambdaFunction("src/runtime/handlers/CognitoServiceProviderMetaDataHandler.ts",esBuildExternal),
			...zipLambdaFunction("src/runtime/handlers/IdentityProviderRouter.ts",esBuildExternal),
			{
				exec: `zip -r ${p.outdir}/dist/lambdas-layer.zip ./nodejs`,
				cwd: `/tmp/${p.name}`
			}
		]
		return steps
	})
	root.synth();
}

main().then(() => {

}).catch(reason => {
	throw new Error(reason);
});