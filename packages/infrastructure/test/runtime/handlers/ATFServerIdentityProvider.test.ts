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

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
// @ts-ignore
import { onEventHandler } from "../../../src/runtime/handlers/ATFServerIdentityProvider";
import { createSandbox, SinonSandbox } from "sinon";

import { Aws, AwsApiCalls, Powertools } from "../../../src/runtime/utils";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import { CognitoJwtVerifierSingleUserPool } from "aws-jwt-verify/cognito-verifier";
import { CognitoIdOrAccessTokenPayload } from "aws-jwt-verify/jwt-model";
import { APIGatewayProxyResult } from "aws-lambda/trigger/api-gateway-proxy";


describe("ATFServerIdentityProvider", () => {
  let sb: SinonSandbox;
  beforeEach(_args => {
    sb = createSandbox();
  });

  afterEach(_args => {
    sb.restore();
  });

  beforeAll(_args => {

    vi.stubEnv("USER_POOL_ID", "6pdngjfd6aum39junvfvcb5mef");
    vi.stubEnv("BUCKET_NAME", "test_bucket");
    vi.stubEnv("BUCKET_ROLE_ARN", "arn:aws:iam::123456789012:role/transfer-access-role");
  });
  it("Validate username and password", async () => {

    const event = {
      "resource": "/servers/{serverId}/users/{username}/config",
      "path": "/servers/s-34be9433edad41479/users/sally.demo%40institution01.edu/config",
      "httpMethod": "GET",
      "headers": {
        "Password": "password"
      },
      "pathParameters": {
        "serverId": "s-34be9433edad41479",
        "username": "sally.demo%40institution01.edu"
      }
    };
    const powertools = new Powertools({
      serviceName: "ATFServerIdentityProvider"
    });
    const awsApiCalls: AwsApiCalls = Aws.instance({}, powertools);
    const stubbedAws = sb.stub(awsApiCalls);
    const promise = Promise.resolve(unmarshall({
      "pk": {
        "S": "sally.demo@institution01.edu"
      },
      "accessToken": {
        "S": "eyJraWQiOiJFSkYyZEJwN1BmbjZzeDRWMktkbjFSd0hqRHBqbUZtd1RzNnd5Z2prQ2ljPSIsImFsZyI6IlJTMjU2In0.eyJzdWIiOiI5ZjlmMGM3My1jYmEzLTRmOGYtOTA3NC1lZDA4NDIwNmYxM2MiLCJjb2duaXRvOmdyb3VwcyI6WyJ1cy1lYXN0LTJfNFE0UUxBN2lyX0BpbnN0aXR1dGlvbjAxLmVkdSJdLCJpc3MiOiJodHRwczpcL1wvY29nbml0by1pZHAudXMtZWFzdC0yLmFtYXpvbmF3cy5jb21cL3VzLWVhc3QtMl80UTRRTEE3aXIiLCJ2ZXJzaW9uIjoyLCJjbGllbnRfaWQiOiI2cGRuZ2pmZDZhdW0zOWp1bnZmdmNiNW1lZiIsIm9yaWdpbl9qdGkiOiJjZTFmNTY1NS0zNDY0LTRjYzAtYWE3OC01YTVmOTRjOTVmNTYiLCJ0b2tlbl91c2UiOiJhY2Nlc3MiLCJzY29wZSI6IkBpbnN0aXR1dGlvbjAxLmVkdVwvdHJhbnNmZXIgb3BlbmlkIGVtYWlsIiwiYXV0aF90aW1lIjoxNzEwOTM4ODY3LCJleHAiOjE3MTA5NDI0NjcsImlhdCI6MTcxMDkzODg2NywianRpIjoiMjM4MDViNDAtYWFlYi00MTY2LWEwY2MtNmUyMTQ5MjZiNDU5IiwidXNlcm5hbWUiOiJAaW5zdGl0dXRpb24wMS5lZHVfc2FsbHkuZGVtb0BpbnN0aXR1dGlvbjAxLmVkdSJ9.ki-5u4ZEr1kadZd2FAbu59-G0j7-7AmUUF1NWnkgU7Mm6_B6ixpxwExQItsbra43iPRZhiL4wq2v8NXEBDbwRa5PjkHqgEIAU7l1GV4MRS1Zo5SAyvXsfu4x9tHpeqpDV8CdB1WFHe5HYa26Pk7QBPqbIZEQRBuk4YoCyFe7RRcJuxYUW0BemxSEyRFMC0EGYKCL78EIveQBnQsnh_PAbrI29r3lmxGayabZZEntXoByO0N41x5aSCgQb1XwXQaM7wdMXihAqHNNZFL2jkJegQQZ1DGbXnfzyyRUmw9JjH5b2fhqKtd6hQKXxKOKjzuHdzGWzvJmZ0BZcZhLKH9uhQ"
      },
      "password": {
        "S": "password"
      },
      "ttl": {
        "N": "1710942467"
      },
      "userInfo": {
        "M": {
          "custom:atf_home": {
            "S": "{\"dir\":\"\\/sally.demo\",\"permissions\":\"rw\"}"
          },
          "custom:atf_permissions": {
            "S": "[{\"dir\":\"\\/reports\",\"permissions\":\"r\"},{\"dir\":\"\\/upload\",\"permissions\":\"w\"}]"
          }, "email": {
            "S": "sally.demo@institution01.edu"
          },
          "email_verified": {
            "S": "true"
          },
          "sub": {
            "S": "9f9f0c73-cba3-4f8f-9074-ed084206f13c"
          },
          "username": {
            "S": "@institution01.edu_sally.demo@institution01.edu"
          }
        }
      },
      "userPoolClientId": {
        "S": "6pdngjfd6aum39junvfvcb5mef"
      }
    }));
    stubbedAws.getItem.returns(promise);
    //@ts-ignore

    const verifierInstance: CognitoJwtVerifierSingleUserPool<any> = {
      //@ts-ignore
      verify<any>(...[_jwt, _properties]): Promise<CognitoIdOrAccessTokenPayload<any, any>> {
        //@ts-ignore
        return null;
      }
    };
    const verifier = sb.stub(verifierInstance);

    // @ts-ignore
    const response = await onEventHandler(event, {
      invokedFunctionArn: "arn:aws:lambda:us-east-2:123456789012:function:ATFServerIdentityProvider"
    }, (_error, _result) => {
    }, {
      aws: stubbedAws,
      powertools,
      verifier: verifier
    }) as APIGatewayProxyResult;
    expect(response).toBeDefined();
    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual(JSON.stringify({
      "Role": "arn:aws:iam::123456789012:role/atf-with-saml-role-institution01edu",
      "HomeDirectoryType": "LOGICAL",
      "HomeDirectoryDetails": "[{\"Entry\":\"/sally.demo\",\"Target\":\"/atf-with-saml-123456789012-us-east-2-institution01edu/sally.demo\"},{\"Entry\":\"/reports\",\"Target\":\"/atf-with-saml-123456789012-us-east-2-institution01edu/reports\"},{\"Entry\":\"/upload\",\"Target\":\"/atf-with-saml-123456789012-us-east-2-institution01edu/upload\"}]",
      "Policy": "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Sid\":\"AllowListingOfTenantBucket\",\"Action\":[\"s3:ListBucket\"],\"Effect\":\"Allow\",\"Resource\":[\"arn:aws:s3:::atf-with-saml-123456789012-us-east-2-institution01edu\"],\"Condition\":{\"StringLike\":{\"s3:prefix\":[\"sally.demo/*\",\"sally.demo\",\"reports/*\",\"reports\",\"upload/*\",\"upload\"]}}},{\"Sid\":\"HomeDirObjectAccess\",\"Effect\":\"Allow\",\"Action\":[\"s3:GetObject\",\"s3:GetObjectVersion\",\"s3:GetObjectACL\",\"s3:PutObject\",\"s3:DeleteObjectVersion\",\"s3:DeleteObject\",\"s3:PutObjectACL\"],\"Resource\":\"arn:aws:s3:::atf-with-saml-123456789012-us-east-2-institution01edu/sally.demo/*\"},{\"Effect\":\"Allow\",\"Action\":[\"s3:GetObject\",\"s3:GetObjectVersion\",\"s3:GetObjectACL\"],\"Resource\":\"arn:aws:s3:::atf-with-saml-123456789012-us-east-2-institution01edu/reports/*\"},{\"Effect\":\"Allow\",\"Action\":[\"s3:PutObject\",\"s3:DeleteObjectVersion\",\"s3:DeleteObject\",\"s3:PutObjectACL\"],\"Resource\":\"arn:aws:s3:::atf-with-saml-123456789012-us-east-2-institution01edu/upload/*\"}]}"
    }));
  });
  it("Can handle overlapping paths", async () => {

    const event = {
      "resource": "/servers/{serverId}/users/{username}/config",
      "path": "/servers/s-34be9433edad41479/users/sally.demo%40institution01.edu/config",
      "httpMethod": "GET",
      "headers": {
        "Password": "password"
      },
      "pathParameters": {
        "serverId": "s-34be9433edad41479",
        "username": "sally.demo%40institution01.edu"
      }
    };
    const powertools = new Powertools({
      serviceName: "ATFServerIdentityProvider"
    });
    const awsApiCalls: AwsApiCalls = Aws.instance({}, powertools);
    const stubbedAws = sb.stub(awsApiCalls);
    const promise = Promise.resolve(unmarshall({
      "pk": {
        "S": "sally.demo@institution01.edu"
      },
      "accessToken": {
        "S": "eyJraWQiOiJFSkYyZEJwN1BmbjZzeDRWMktkbjFSd0hqRHBqbUZtd1RzNnd5Z2prQ2ljPSIsImFsZyI6IlJTMjU2In0.eyJzdWIiOiI5ZjlmMGM3My1jYmEzLTRmOGYtOTA3NC1lZDA4NDIwNmYxM2MiLCJjb2duaXRvOmdyb3VwcyI6WyJ1cy1lYXN0LTJfNFE0UUxBN2lyX0BpbnN0aXR1dGlvbjAxLmVkdSJdLCJpc3MiOiJodHRwczpcL1wvY29nbml0by1pZHAudXMtZWFzdC0yLmFtYXpvbmF3cy5jb21cL3VzLWVhc3QtMl80UTRRTEE3aXIiLCJ2ZXJzaW9uIjoyLCJjbGllbnRfaWQiOiI2cGRuZ2pmZDZhdW0zOWp1bnZmdmNiNW1lZiIsIm9yaWdpbl9qdGkiOiJjZTFmNTY1NS0zNDY0LTRjYzAtYWE3OC01YTVmOTRjOTVmNTYiLCJ0b2tlbl91c2UiOiJhY2Nlc3MiLCJzY29wZSI6IkBpbnN0aXR1dGlvbjAxLmVkdVwvdHJhbnNmZXIgb3BlbmlkIGVtYWlsIiwiYXV0aF90aW1lIjoxNzEwOTM4ODY3LCJleHAiOjE3MTA5NDI0NjcsImlhdCI6MTcxMDkzODg2NywianRpIjoiMjM4MDViNDAtYWFlYi00MTY2LWEwY2MtNmUyMTQ5MjZiNDU5IiwidXNlcm5hbWUiOiJAaW5zdGl0dXRpb24wMS5lZHVfc2FsbHkuZGVtb0BpbnN0aXR1dGlvbjAxLmVkdSJ9.ki-5u4ZEr1kadZd2FAbu59-G0j7-7AmUUF1NWnkgU7Mm6_B6ixpxwExQItsbra43iPRZhiL4wq2v8NXEBDbwRa5PjkHqgEIAU7l1GV4MRS1Zo5SAyvXsfu4x9tHpeqpDV8CdB1WFHe5HYa26Pk7QBPqbIZEQRBuk4YoCyFe7RRcJuxYUW0BemxSEyRFMC0EGYKCL78EIveQBnQsnh_PAbrI29r3lmxGayabZZEntXoByO0N41x5aSCgQb1XwXQaM7wdMXihAqHNNZFL2jkJegQQZ1DGbXnfzyyRUmw9JjH5b2fhqKtd6hQKXxKOKjzuHdzGWzvJmZ0BZcZhLKH9uhQ"
      },
      "password": {
        "S": "password"
      },
      "ttl": {
        "N": "1710942467"
      },
      "userInfo": {
        "M": {
          "custom:atf_home": {
            "S": "{\"dir\":\"\\/sally.demo\",\"permissions\":\"rw\"}"
          },
          "custom:atf_permissions": {
            "S": "[{\"dir\":\"\\/reports\",\"permissions\":\"r\"},{\"dir\":\"\\/reports/archive\",\"permissions\":\"rw\"}]"
          }, "email": {
            "S": "sally.demo@institution01.edu"
          },
          "email_verified": {
            "S": "true"
          },
          "sub": {
            "S": "9f9f0c73-cba3-4f8f-9074-ed084206f13c"
          },
          "username": {
            "S": "@institution01.edu_sally.demo@institution01.edu"
          }
        }
      },
      "userPoolClientId": {
        "S": "6pdngjfd6aum39junvfvcb5mef"
      }
    }));
    stubbedAws.getItem.returns(promise);
    //@ts-ignore

    const verifierInstance: CognitoJwtVerifierSingleUserPool<any> = {
      //@ts-ignore
      verify<any>(...[_jwt, _properties]): Promise<CognitoIdOrAccessTokenPayload<any, any>> {
        //@ts-ignore
        return null;
      }
    };
    const verifier = sb.stub(verifierInstance);

    // @ts-ignore
    const response = await onEventHandler(event, {
      invokedFunctionArn: "arn:aws:lambda:us-east-2:123456789012:function:ATFServerIdentityProvider"
    }, (_error, _result) => {
    }, {
      aws: stubbedAws,
      powertools,
      verifier: verifier
    }) as APIGatewayProxyResult;
    expect(response).toBeDefined();
    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual(JSON.stringify({
      "Role": "arn:aws:iam::123456789012:role/atf-with-saml-role-institution01edu",
      "HomeDirectoryType": "LOGICAL",
      "HomeDirectoryDetails": "[{\"Entry\":\"/sally.demo\",\"Target\":\"/atf-with-saml-123456789012-us-east-2-institution01edu/sally.demo\"},{\"Entry\":\"/reports\",\"Target\":\"/atf-with-saml-123456789012-us-east-2-institution01edu/reports\"}]",
      "Policy": "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Sid\":\"AllowListingOfTenantBucket\",\"Action\":[\"s3:ListBucket\"],\"Effect\":\"Allow\",\"Resource\":[\"arn:aws:s3:::atf-with-saml-123456789012-us-east-2-institution01edu\"],\"Condition\":{\"StringLike\":{\"s3:prefix\":[\"sally.demo/*\",\"sally.demo\",\"reports/*\",\"reports\",\"reports/archive/*\",\"reports/archive\"]}}},{\"Sid\":\"HomeDirObjectAccess\",\"Effect\":\"Allow\",\"Action\":[\"s3:GetObject\",\"s3:GetObjectVersion\",\"s3:GetObjectACL\",\"s3:PutObject\",\"s3:DeleteObjectVersion\",\"s3:DeleteObject\",\"s3:PutObjectACL\"],\"Resource\":\"arn:aws:s3:::atf-with-saml-123456789012-us-east-2-institution01edu/sally.demo/*\"},{\"Effect\":\"Allow\",\"Action\":[\"s3:GetObject\",\"s3:GetObjectVersion\",\"s3:GetObjectACL\"],\"Resource\":\"arn:aws:s3:::atf-with-saml-123456789012-us-east-2-institution01edu/reports/*\"},{\"Effect\":\"Allow\",\"Action\":[\"s3:GetObject\",\"s3:GetObjectVersion\",\"s3:GetObjectACL\",\"s3:PutObject\",\"s3:DeleteObjectVersion\",\"s3:DeleteObject\",\"s3:PutObjectACL\"],\"Resource\":\"arn:aws:s3:::atf-with-saml-123456789012-us-east-2-institution01edu/reports/archive/*\"}]}"
    }));
  });
});