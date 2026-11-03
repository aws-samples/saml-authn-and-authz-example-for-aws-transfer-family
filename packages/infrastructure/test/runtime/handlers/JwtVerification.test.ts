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

/*
 * Rejection tests for the access-token check in the auth path.
 *
 * The verifier is the real aws-jwt-verify CognitoJwtVerifier, configured the
 * same way as the handlers (userPoolId only, then verify(token, { tokenUse:
 * "access", clientId })). Tokens are signed locally with a generated RSA key,
 * and the JWKS comes from an in-memory JwksCache, so no network is used.
 */
import { createSign, generateKeyPairSync, KeyObject } from "crypto";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import { CognitoJwtVerifier } from "aws-jwt-verify";
import { JwksCache } from "aws-jwt-verify/jwk";
import { APIGatewayProxyResult } from "aws-lambda/trigger/api-gateway-proxy";
import { createSandbox, SinonSandbox } from "sinon";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
// @ts-ignore
import { onEventHandler as atfHandler } from "../../../src/runtime/handlers/ATFServerIdentityProvider";
// @ts-ignore
import { onEventHandler as samlCallbackHandler } from "../../../src/runtime/handlers/SamlCallbackHandler";
import { Aws, AwsApiCalls, Powertools } from "../../../src/runtime/utils";

const REGION = "us-east-2";
const USER_POOL_ID = `${REGION}_TestPool1`;
const ISSUER = `https://cognito-idp.${REGION}.amazonaws.com/${USER_POOL_ID}`;
const JWKS_URI = `${ISSUER}/.well-known/jwks.json`;
const CLIENT_ID = "testclientid000000000000000";
const KID = "test-kid-1";

const trustedKey = generateKeyPairSync("rsa", { modulusLength: 2048 });
const attackerKey = generateKeyPairSync("rsa", { modulusLength: 2048 });

const jwks = {
  keys: [
    {
      ...(trustedKey.publicKey.export({ format: "jwk" }) as Record<string, string>),
      kid: KID,
      alg: "RS256",
      use: "sig",
    },
  ],
};

/** In-memory JwksCache: serves the test JWKS for the expected URI only. */
class FakeJwksCache implements JwksCache {
  readonly requestedUris: string[] = [];

  private find(jwksUri: string, kid: string | undefined) {
    this.requestedUris.push(jwksUri);
    if (jwksUri !== JWKS_URI) {
      throw new Error(`Unexpected JWKS URI ${jwksUri}`);
    }
    const jwk = jwks.keys.find((k) => k.kid === kid);
    if (!jwk) {
      throw new Error(`kid ${kid} not found in JWKS`);
    }
    return jwk as any;
  }

  async getJwk(jwksUri: string, decomposedJwt: any) {
    return this.find(jwksUri, decomposedJwt.header.kid);
  }

  getCachedJwk(jwksUri: string, decomposedJwt: any) {
    return this.find(jwksUri, decomposedJwt.header.kid);
  }

  addJwks() {}

  async getJwks(jwksUri: string) {
    this.find(jwksUri, KID);
    return jwks as any;
  }
}

const b64url = (input: Buffer | string) => Buffer.from(input).toString("base64url");

function signJwt(payload: Record<string, unknown>, opts: { key?: KeyObject; header?: Record<string, unknown> } = {}): string {
  const header = { kid: KID, alg: "RS256", ...opts.header };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const signature = createSign("RSA-SHA256")
    .update(signingInput)
    .sign(opts.key ?? trustedKey.privateKey);
  return `${signingInput}.${b64url(signature)}`;
}

function accessTokenPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const now = Math.floor(Date.now() / 1000);
  return {
    sub: "9f9f0c73-cba3-4f8f-9074-ed084206f13c",
    iss: ISSUER,
    client_id: CLIENT_ID,
    token_use: "access",
    scope: "openid email",
    auth_time: now - 60,
    iat: now - 60,
    exp: now + 3600,
    jti: "23805b40-aaeb-4166-a0cc-6e214926b459",
    username: "sally.demo@institution01.edu",
    ...overrides,
  };
}

function newVerifier(cache: FakeJwksCache) {
  // Same construction as the handlers.
  return CognitoJwtVerifier.create({ userPoolId: USER_POOL_ID }, { jwksCache: cache });
}

async function verifyAccessToken(token: string, cache = new FakeJwksCache()) {
  return newVerifier(cache).verify(token, { tokenUse: "access", clientId: CLIENT_ID });
}

describe("Cognito access token verification", () => {
  it("accepts a valid access token and fetches keys only from the pool's regional JWKS URI", async () => {
    const cache = new FakeJwksCache();
    const payload = await verifyAccessToken(signJwt(accessTokenPayload()), cache);
    expect(payload.client_id).toBe(CLIENT_ID);
    expect(new Set(cache.requestedUris)).toEqual(new Set([JWKS_URI]));
  });

  it("rejects an expired token", async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = signJwt(accessTokenPayload({ iat: now - 7200, exp: now - 3600 }));
    await expect(verifyAccessToken(token)).rejects.toThrow(/expired/i);
  });

  it("rejects a token that is not valid yet (nbf in the future)", async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = signJwt(accessTokenPayload({ nbf: now + 3600 }));
    await expect(verifyAccessToken(token)).rejects.toThrow(/can't be used before/i);
  });

  it("rejects a token for a different app client (wrong audience)", async () => {
    const token = signJwt(accessTokenPayload({ client_id: "someotherclientid0000000000" }));
    await expect(verifyAccessToken(token)).rejects.toThrow(/client id/i);
  });

  it("rejects a token issued by a different user pool", async () => {
    const token = signJwt(accessTokenPayload({ iss: `https://cognito-idp.${REGION}.amazonaws.com/${REGION}_OtherPool` }));
    await expect(verifyAccessToken(token)).rejects.toThrow(/issuer/i);
  });

  it("rejects a token from a look-alike issuer host", async () => {
    const token = signJwt(accessTokenPayload({ iss: `https://cognito-idp.${REGION}.amazonaws.com.evil.example/${USER_POOL_ID}` }));
    await expect(verifyAccessToken(token)).rejects.toThrow(/issuer/i);
  });

  it("only ever looks up keys at the AWS-hosted JWKS URIs for this pool, even for the global issuer format", async () => {
    // aws-jwt-verify 5.2 also accepts Cognito's global issuer format for the
    // configured pool; keys must still come from AWS-hosted JWKS for that pool.
    const allowedJwksUris = [JWKS_URI, `https://issuer-cognito-idp.${REGION}.amazonaws.com/${USER_POOL_ID}/.well-known/jwks.json`];
    const cache = new FakeJwksCache();
    const token = signJwt(accessTokenPayload({ iss: `https://issuer-cognito-idp.${REGION}.amazonaws.com/${USER_POOL_ID}` }));
    // The fake cache only serves the regional JWKS, so this is rejected either way.
    await expect(verifyAccessToken(token, cache)).rejects.toThrow();
    for (const uri of cache.requestedUris) {
      expect(allowedJwksUris).toContain(uri);
    }
  });

  it("rejects a token without an iss claim", async () => {
    const payload = accessTokenPayload();
    delete payload.iss;
    await expect(verifyAccessToken(signJwt(payload))).rejects.toThrow(/issuer/i);
  });

  it("rejects an ID token where an access token is required", async () => {
    const token = signJwt(accessTokenPayload({ token_use: "id", aud: CLIENT_ID }));
    await expect(verifyAccessToken(token)).rejects.toThrow(/token use/i);
  });

  it("rejects a token signed by a key that is not in the JWKS", async () => {
    const token = signJwt(accessTokenPayload(), { key: attackerKey.privateKey });
    await expect(verifyAccessToken(token)).rejects.toThrow(/signature/i);
  });

  it("rejects a token whose payload was changed after signing", async () => {
    const [header, , signature] = signJwt(accessTokenPayload()).split(".");
    const tampered = b64url(JSON.stringify(accessTokenPayload({ username: "admin@institution01.edu" })));
    await expect(verifyAccessToken(`${header}.${tampered}.${signature}`)).rejects.toThrow(/signature/i);
  });

  it("rejects alg none", async () => {
    const header = b64url(JSON.stringify({ kid: KID, alg: "none" }));
    const body = b64url(JSON.stringify(accessTokenPayload()));
    await expect(verifyAccessToken(`${header}.${body}.`)).rejects.toThrow();
  });

  it("rejects an HS256 token (algorithm confusion)", async () => {
    const token = signJwt(accessTokenPayload(), { header: { alg: "HS256" } });
    await expect(verifyAccessToken(token)).rejects.toThrow(/algorithm/i);
  });

  it("rejects a token with an unknown kid", async () => {
    const token = signJwt(accessTokenPayload(), { header: { kid: "unknown-kid" } });
    await expect(verifyAccessToken(token)).rejects.toThrow(/kid/i);
  });

  it("rejects a malformed token", async () => {
    await expect(verifyAccessToken("not-a-jwt")).rejects.toThrow();
  });
});

describe("Auth path handlers with a real verifier", () => {
  let sb: SinonSandbox;
  const powertools = new Powertools({ serviceName: "JwtVerificationTest" });

  beforeAll(() => {
    vi.stubEnv("USER_POOL_ID", USER_POOL_ID);
    vi.stubEnv("TABLE_NAME", "test_table");
    vi.stubEnv("COGNITO_URL", "https://auth.example.test");
  });

  beforeEach(() => {
    sb = createSandbox();
  });

  afterEach(() => {
    sb.restore();
    vi.unstubAllGlobals();
  });

  const atfEvent = {
    resource: "/servers/{serverId}/users/{username}/config",
    path: "/servers/s-34be9433edad41479/users/sally.demo%40institution01.edu/config",
    httpMethod: "GET",
    headers: { Password: "password" },
    pathParameters: { serverId: "s-34be9433edad41479", username: "sally.demo%40institution01.edu" },
  };

  function storedAuth(accessToken: string) {
    return unmarshall({
      pk: { S: "sally.demo@institution01.edu" },
      accessToken: { S: accessToken },
      password: { S: "password" },
      userInfo: {
        M: {
          "custom:atf_home": { S: "{\"dir\":\"/sally.demo\",\"permissions\":\"rw\"}" },
          "custom:atf_permissions": { S: "[]" },
          "email": { S: "sally.demo@institution01.edu" },
        },
      },
      userPoolClientId: { S: CLIENT_ID },
    });
  }

  async function callAtf(accessToken: string) {
    const aws: AwsApiCalls = Aws.instance({}, powertools);
    const stubbedAws = sb.stub(aws);
    stubbedAws.getItem.resolves(storedAuth(accessToken));
    // @ts-ignore
    return (await atfHandler(atfEvent, { invokedFunctionArn: "arn:aws:lambda:us-east-2:123456789012:function:ATFServerIdentityProvider" }, () => {}, {
      aws: stubbedAws,
      powertools,
      verifier: newVerifier(new FakeJwksCache()),
    })) as APIGatewayProxyResult;
  }

  it("ATFServerIdentityProvider returns a role for a valid token", async () => {
    const response = await callAtf(signJwt(accessTokenPayload()));
    expect(JSON.parse(response.body).Role).toBe("arn:aws:iam::123456789012:role/atf-with-saml-role-institution01edu");
  });

  it.each([
    ["expired", () => signJwt(accessTokenPayload({ exp: Math.floor(Date.now() / 1000) - 60 }))],
    ["wrong client", () => signJwt(accessTokenPayload({ client_id: "someotherclientid0000000000" }))],
    ["wrong issuer", () => signJwt(accessTokenPayload({ iss: `https://cognito-idp.${REGION}.amazonaws.com/${REGION}_OtherPool` }))],
    ["untrusted key", () => signJwt(accessTokenPayload(), { key: attackerKey.privateKey })],
  ])("ATFServerIdentityProvider grants no role for a %s token", async (_name, token) => {
    const response = await callAtf(token());
    // Transfer Family treats a response without Role as a failed login.
    expect(response.body === undefined || JSON.parse(response.body)?.Role === undefined).toBe(true);
  });

  async function callSamlCallback(accessToken: string) {
    const aws: AwsApiCalls = Aws.instance({}, powertools);
    const stubbedAws = sb.stub(aws);
    stubbedAws.findUserPoolClient.resolves({ ClientId: CLIENT_ID });
    stubbedAws.getRandomPassword.resolves({ RandomPassword: "Abc123xyz", $metadata: {} });
    stubbedAws.putItem.resolves({ $metadata: {} });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (request: Request) => {
        const url = typeof request === "string" ? request : request.url;
        if (url.endsWith("/oauth2/token")) {
          return new Response(JSON.stringify({ access_token: accessToken }));
        }
        return new Response(JSON.stringify({ email: "sally.demo@institution01.edu" }));
      }),
    );
    const event = {
      queryStringParameters: { code: "auth-code", state: btoa(JSON.stringify({ providerName: "institution01" })) },
      headers: { Host: "api.example.test" },
      requestContext: { path: "/prod/saml/callback" },
    };
    // @ts-ignore
    const response = (await samlCallbackHandler(event, {}, () => {}, {
      aws: stubbedAws,
      powertools,
      verifier: newVerifier(new FakeJwksCache()),
    })) as APIGatewayProxyResult;
    return { response, putItem: stubbedAws.putItem };
  }

  it("SamlCallbackHandler issues credentials for a valid token", async () => {
    const { response, putItem } = await callSamlCallback(signJwt(accessTokenPayload()));
    expect(response.statusCode).toBe(200);
    expect(putItem.calledOnce).toBe(true);
  });

  it.each([
    ["expired", () => signJwt(accessTokenPayload({ exp: Math.floor(Date.now() / 1000) - 60 }))],
    ["wrong client", () => signJwt(accessTokenPayload({ client_id: "someotherclientid0000000000" }))],
    ["wrong issuer", () => signJwt(accessTokenPayload({ iss: `https://cognito-idp.${REGION}.amazonaws.com/${REGION}_OtherPool` }))],
    ["untrusted key", () => signJwt(accessTokenPayload(), { key: attackerKey.privateKey })],
  ])("SamlCallbackHandler issues no credentials for a %s token", async (_name, token) => {
    const { response, putItem } = await callSamlCallback(token());
    expect(response.statusCode).toBe(500);
    expect(putItem.called).toBe(false);
  });
});
