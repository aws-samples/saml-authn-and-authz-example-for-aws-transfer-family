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

import { awscdk, javascript } from "projen";
import { ReleaseTrigger } from "projen/lib/release";

import { TypeScriptProject } from "projen/lib/typescript";
// @ts-ignore
import { PnpmWorkspace, workspacePackages } from "./projenrc/pnpm";
// @ts-ignore
import { Nx } from "./projenrc/nx";
// @ts-ignore
import { EslintFlatConfig } from "./projenrc/eslint";
import { NodeProject, TypeScriptModuleResolution } from "projen/lib/javascript";
// @ts-ignore
import { overrideFormatting, zipLambdaFunction, zipRuntime } from "./projenrc/utils";
import { TaskStep } from "projen/lib/task-model";


const defaultReleaseBranch = "main";
// Pinned so that projen synthesis is reproducible. Previously this was read
// from `npm show aws-cdk-lib version` at synth time, so every projen run moved
// the ranges to the latest release. Dependabot or a maintainer bumps these
// here (and re-runs projen) when upgrading CDK.
// - cdkVersion: minimum aws-cdk-lib version (rendered as ^cdkVersion).
// - cdkCliVersion: the aws-cdk CLI, versioned separately (2.1000+) since 2025.
const cdkVersion = "2.275.0";
const cdkCliVersion = "2.1147.0";
// @types/node tracks the Lambda runtime (Runtime.NODEJS_LATEST = nodejs24.x),
// not minNodeVersion, which projen would otherwise use (^20).
const typesNodeVersion = "^24";
// projen itself. ^ on a 0.x version only allows patch updates (0.104.x), so
// Dependabot's lockfile-only updates stay on this minor line. Bump it here and
// re-run projen to move to a newer minor.
const projenVersion = "^0.104.25";
// PR title lint action for .github/workflows/pull-request-lint.yml, pinned by
// commit SHA. projen 0.104.x still pins v6.1.1, so this overrides its pin.
// Remove the override once projen pins this version (or newer) itself.
const semanticPrAction = "amannn/action-semantic-pull-request@2252a14e810aa9b85c2d560bd7070c802206ecf6"; // v6.1.2
const nodeVersion = "20.11.1";
const pnpmVersion = "8.15.3";
const jsiiReleaseVersion = "1.94.0";
const namespace = "@saml-authn-and-authz-example-for-aws-transfer-family";

// Security overrides for transitive dependencies, rendered into the root
// package.json under `pnpm.overrides`. Keys use pnpm's `name@<selector>` form,
// which projen's addPackageResolutions() cannot express, so they are written
// with package.addField() instead. Edit this list, not package.json.
const pnpmOverrides: Record<string, string> = {
  "form-data@<2.5.6": ">=2.5.6",
  "form-data@>=4.0.0 <4.0.6": ">=4.0.6",
  "fast-xml-parser@<4.5.5": ">=4.5.5",
  "braces@<3.0.3": ">=3.0.3",
  "brace-expansion@<1.1.16": ">=1.1.16",
  "brace-expansion@>=2.0.0 <2.1.6": ">=2.1.6",
  "brace-expansion@>=4.0.0 <5.0.12": ">=5.0.12 <6.0.0",
  "follow-redirects@<1.16.2": ">=1.16.2 <2.0.0",
  "nanoid@<3.3.12": ">=3.3.12",
  "postcss@<8.5.18": ">=8.5.18",
  "rollup@>=4.0.0 <4.59.0": ">=4.59.0",
  "glob@>=10.2.0 <10.5.0": ">=10.5.0",
  "tar@<7.5.11": ">=7.5.11",
  "sigstore@<4.1.1": ">=4.1.1",
  "ip-address@<10.3.1": ">=10.3.1",
  "js-yaml@>=3.0.0 <3.15.2": ">=3.15.2",
  "js-yaml@>=4.0.0 <4.3.2": ">=4.3.2",
  "tmp@<0.2.6": ">=0.2.6",
  "flatted@<3.4.2": ">=3.4.2",
  "aws-cdk-lib@<2.260.0": ">=2.260.0",
  "constructs@<10.5.0": ">=10.5.0",
  "minimatch@>=3.0.0 <3.1.3": ">=3.1.3 <4.0.0",
  "minimatch@>=5.0.0 <5.1.8": ">=5.1.8 <6.0.0",
  "minimatch@>=7.0.0 <11.0.1": "11.0.4",
  "vite@>=5.0.0 <6.4.5": ">=6.4.5 <7.0.0",
  "tinypool@<2.1.2": ">=2.1.2 <3.0.0",
  "esbuild@<0.25.0": ">=0.25.0 <0.26.0",
  "ejs@<3.1.10": ">=3.1.10",
  "picomatch@>=2.0.0 <2.3.2": ">=2.3.2 <3.0.0",
  "uuid@<11.1.1": ">=11.1.1 <12.0.0",
  "postcss-selector-parser@<7.1.6": ">=7.1.6 <8.0.0",
  "@smithy/config-resolver@<4.4.0": ">=4.4.0 <5.0.0",
  "axios@>=1.0.0 <1.20.0": ">=1.20.0 <2.0.0",
  "smol-toml@<1.7.1": ">=1.7.1 <2.0.0"
};

const main = async () => {
  const root = new TypeScriptProject({
    name: `${namespace}/root`,
    defaultReleaseBranch,
    packageManager: javascript.NodePackageManager.PNPM,
    projenCommand: "pnpm dlx projen",
    projenVersion,
    pnpmVersion,
    // Filled in by PnpmWorkspace once the subprojects exist.
    pnpmOptions: { workspaceYamlOptions: { packages: workspacePackages } },
    minNodeVersion: nodeVersion,
    projenrcTs: true,
    sampleCode: false,
    license: "MIT-0",
    copyrightOwner: "Amazon.com, Inc. or its affiliates. All Rights Reserved.",
    // Fixed so LICENSE does not change to the current year on every projen run.
    copyrightPeriod: "2024",
    tsconfig: {
      compilerOptions: {
        target: "ES2022",
        lib: ["ES2022"]
      },
      include: ["projen/**/*.ts"]
    },
    gitignore: [".DS_Store", ".idea", "*.iml", ".$*", "appsec"],
    // Jest and eslint are disabled at the root as they will be
    // configured by each subproject. Using a single jest/eslint
    // config at the root is out of scope for this walkthrough
    eslint: false,
    jest: false,

    // Disable default github actions workflows generated
    // by projen as we will generate our own later (that uses nx)
    depsUpgradeOptions: { workflow: false },
    buildWorkflow: false,
    release: false,
    devDeps: [
      "@npmcli/arborist",
      "@types/npm-packlist",
      "@types/npmcli__arborist",
      "prettier@^3.9.10"
    ]
  });

  const infrastructure = new awscdk.AwsCdkTypeScriptApp({
    name: `infrastructure`,
    packageName: `${namespace}/infrastructure`,
    jsiiReleaseVersion,
    outdir: "./packages/infrastructure",
    parent: root,
    cdkVersion,
    cdkCliVersion: `^${cdkCliVersion}`,
    defaultReleaseBranch,

    packageManager: root.package.packageManager,
    projenCommand: root.projenCommand,
    projenVersion,
    pnpmVersion,
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
        // projen 0.104's awscdk defaults switched to module NodeNext and
        // turned these checks off; keep the values this project used before.
        module: "CommonJS",
        noUnusedLocals: true,
        noUnusedParameters: true,
        noFallthroughCasesInSwitch: true,
        strictPropertyInitialization: true,
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        moduleResolution: TypeScriptModuleResolution.BUNDLER,
        strict: true,
        noEmit: true,
        isolatedModules: true
      }

    },

    eslintOptions: {

      dirs: ["src/runtime"],
      devdirs: ["test"],
      ignorePatterns: ["test/*"]
    },
    releaseTrigger: ReleaseTrigger.manual({}),
    majorVersion: 0,
    deps: [
      "@middy/core@4.7.0",
      // Verifies Cognito access tokens in the auth path; see
      // test/runtime/handlers/JwtVerification.test.ts before changing.
      "aws-jwt-verify@^5.2.1",
      "@aws-crypto/sha256-js",
      "@aws-lambda-powertools/logger",
      "@aws-lambda-powertools/metrics",
      "@aws-lambda-powertools/tracer",
      "@aws-sdk/client-cognito-identity-provider@^3.1161.0",
      "@aws-sdk/client-dynamodb@^3.1161.0",
      "@aws-sdk/client-ssm@^3.1161.0",
      "@aws-sdk/client-secrets-manager@^3.1161.0",
      "@aws-sdk/util-dynamodb",
      "@aws-sdk/types@^3.975.0",
      "@smithy/node-http-handler@^4.14.1",
      "@smithy/protocol-http",
      "@smithy/signature-v4@^5.7.5",
      "@smithy/types",
      "aws-xray-sdk",
      "@types/aws-lambda@^8.10.164"
    ] /* Runtime dependencies of this module. */,
    // description: undefined,  /* The description is just a string that helps people understand the purpose of the package. */
    devDeps: [

      `aws-cdk-lib@^${cdkVersion}`,
      "cdk-assets@^4.8.0",
      "cdk-nag",
      "sinon@^22.1.0",
      "@types/sinon@^22.0.2",
      "vitest"
    ]
  });

  // projen's awscdk and eslint components add these without a version after
  // the constructor's devDeps are processed, so set them here.
  infrastructure.addDevDeps("esbuild@^0.28.2", "eslint-plugin-import@^2.32.0");

  // projen adds @types/node@^<minNodeVersion major>; follow the Lambda runtime instead.
  root.addDevDeps(`@types/node@${typesNodeVersion}`);
  infrastructure.addDevDeps(`@types/node@${typesNodeVersion}`);

  // nx local cache
  root.gitignore.exclude(".nx/");

  root.github?.tryFindWorkflow("pull-request-lint")?.file?.addOverride("jobs.validate.steps.0.uses", semanticPrAction);

  new PnpmWorkspace(root);
  new Nx(root); // add nx to root
  root.package.addField("pnpm", { overrides: pnpmOverrides });
  root.npmrc.addConfig("auto-install-peers", "true");
  root.tasks.addTask("nx", {
    receiveArgs: true
  });
  root.tasks.addTask("deploy", {
    receiveArgs: true
  });
  root.tasks.addTask("destroy", {
    receiveArgs: true
  });
  root.tasks.addTask("prettier", {
    receiveArgs: true
  });
  // ESLint 9 flat config (eslint.config.mjs) instead of .eslintrc.json. Must run
  // before overrideFormatting, which adds the prettier step to the eslint task.
  new EslintFlatConfig(infrastructure);
  overrideFormatting(infrastructure);

  [infrastructure].forEach(value => {


    root.tasks.tryFind("nx")?.exec(`nx build ${value.package.packageName}`, {
      receiveArgs: true
    });
    root.tasks.tryFind("prettier")?.exec(`nx prettier ${value.package.packageName}`, {
      receiveArgs: true
    });
    root.tasks.tryFind("deploy")?.exec(`nx deploy ${value.package.packageName}`, {
      receiveArgs: true
    });
    root.tasks.tryFind("destroy")?.exec(`nx destroy ${value.package.packageName}`, {
      receiveArgs: true
    });
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
        exec: "rm -Rf ./lib/runtime"
      },
      {
        exec: "mkdir ./dist"
      },
      ...zipLambdaFunction("src/runtime/handlers/ATFServerIdentityProvider.ts", esBuildExternal),
      ...zipLambdaFunction("src/runtime/handlers/SamlCallbackHandler.ts", esBuildExternal),
      ...zipLambdaFunction("src/runtime/handlers/CognitoServiceProviderMetaDataHandler.ts", esBuildExternal),
      ...zipLambdaFunction("src/runtime/handlers/IdentityProviderRouter.ts", esBuildExternal),
      {
        exec: `out="$(pwd)/dist/lambdas-layer.zip" && cd /tmp/${p.name} && zip -r "$out" ./nodejs`
      }
    ];
    return steps;
  });
  root.synth();
};

main().then(() => {

}).catch(reason => {
  throw new Error(reason);
});