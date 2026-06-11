import { describe, expect, test } from "bun:test";
import createJwksAccessProofToken from "./createJwksAccessProofToken";
import {
  ApiServerId,
  SCHEMAVAULTS_AUTH_APP_DEFINITION,
  SCHEMAVAULTS_AUTH_SERVER,
  SCHEMAVAULTS_MAIL_SERVER,
  SCHEMAVAULTS_REGISTRY_SERVER,
} from "@schemavaults/app-definitions";
import { PEMFormat, SigningKeyPairFactory } from "@/jwt/jwt_keys";
import { decodeJwt, importPKCS8, importSPKI, SignJWT } from "jose";
import type { JWTPayload } from "jose";
import { sign_verify_alg } from "@/jwt/sign_verify_alg";
import verifyJwksAccessProofToken from "./verifyJwksAccessProofToken";

const DEBUG: boolean = false;

interface TestKeyPair {
  privateKey: CryptoKey;
  publicKey: CryptoKey;
}

async function generateTestKeyPair(): Promise<TestKeyPair> {
  const [privateKeyPem, publicKeyPem] =
    await new SigningKeyPairFactory().generate("pem");
  expect(PEMFormat.isPemFormat(privateKeyPem, "PRIVATE")).toBeTrue();
  expect(PEMFormat.isPemFormat(publicKeyPem, "PUBLIC")).toBeTrue();

  if (DEBUG) {
    console.log("Private Key:\n");
    console.log(privateKeyPem);
    console.log("Public Key:\n");
    console.log(publicKeyPem);
  }

  return {
    privateKey: await importPKCS8(privateKeyPem, sign_verify_alg),
    publicKey: await importSPKI(publicKeyPem, sign_verify_alg),
  };
}

async function testCreateAndVerifyForApiServerId(
  api_server_id: ApiServerId,
): Promise<void> {
  const { privateKey, publicKey } = await generateTestKeyPair();

  const token = await createJwksAccessProofToken({
    api_server_id,
    private_key: privateKey,
  });
  expect(token).toBeString();

  const result = await verifyJwksAccessProofToken({
    api_server_id,
    public_key: publicKey,
    token,
  });
  expect(result).toBeTrue();
}

// Complete claim set matching what createJwksAccessProofToken emits; the
// negative tests below remove or corrupt one claim at a time.
function baselineClaims(api_server_id: ApiServerId): JWTPayload {
  const now = Math.floor(Date.now() / 1000);
  return {
    api_server_id,
    sub: api_server_id,
    iss: api_server_id,
    aud: SCHEMAVAULTS_AUTH_APP_DEFINITION.app_id,
    iat: now,
    nbf: now - 1,
    exp: now + 60,
    jti: crypto.randomUUID(),
  };
}

async function signClaims(
  claims: JWTPayload,
  privateKey: CryptoKey,
): Promise<string> {
  return await new SignJWT(claims)
    .setProtectedHeader({ alg: sign_verify_alg })
    .sign(privateKey);
}

async function expectVerificationToReject(
  token: string,
  api_server_id: ApiServerId,
  publicKey: CryptoKey,
): Promise<void> {
  let rejected: boolean = false;
  try {
    const verified = await verifyJwksAccessProofToken({
      token,
      api_server_id,
      public_key: publicKey,
    });
    rejected = verified !== true;
  } catch (e: unknown) {
    void e;
    rejected = true;
  }
  expect(rejected).toBeTrue();
}

describe("JwksAccessProofToken", async () => {
  test("can create and verify a Jwks Access Proof Token for hardcoded API servers", async () => {
    await testCreateAndVerifyForApiServerId(
      SCHEMAVAULTS_REGISTRY_SERVER.api_server_id,
    );
    await testCreateAndVerifyForApiServerId(
      SCHEMAVAULTS_MAIL_SERVER.api_server_id,
    );
  });

  test("cannot create nor verify a Jwks Access Proof Token for @schemavaults/auth-server", async () => {
    let errorThrown: boolean = false;
    try {
      await testCreateAndVerifyForApiServerId(
        SCHEMAVAULTS_AUTH_SERVER.api_server_id,
      );
    } catch (e: unknown) {
      void e;
      errorThrown = true;
    }
    expect(errorThrown).toBeTrue();
  });

  test("can create and verify a Jwks Access Proof Token for dynamic API servers", async () => {
    for (let i = 0; i < 5; i++) {
      await testCreateAndVerifyForApiServerId(crypto.randomUUID());
    }
  });

  test("emits aud, iss, sub, exp, iat, and jti claims", async () => {
    const api_server_id: ApiServerId = crypto.randomUUID();
    const { privateKey } = await generateTestKeyPair();

    const before = Math.floor(Date.now() / 1000);
    const token = await createJwksAccessProofToken({
      api_server_id,
      private_key: privateKey,
    });
    const after = Math.ceil(Date.now() / 1000);

    const claims = decodeJwt(token);
    expect(claims.aud).toBe(SCHEMAVAULTS_AUTH_APP_DEFINITION.app_id);
    expect(claims.iss).toBe(api_server_id);
    expect(claims.sub).toBe(api_server_id);
    expect(claims.jti).toBeString();
    expect((claims.jti as string).length).toBeGreaterThan(0);
    expect(claims.iat).toBeNumber();
    expect(claims.iat!).toBeGreaterThanOrEqual(before);
    expect(claims.iat!).toBeLessThanOrEqual(after);
    expect(claims.exp).toBeNumber();
    expect(claims.exp! - claims.iat!).toBe(60);
  });

  test("mints a unique jti for every assertion", async () => {
    const api_server_id: ApiServerId = crypto.randomUUID();
    const { privateKey } = await generateTestKeyPair();

    const first = decodeJwt(
      await createJwksAccessProofToken({
        api_server_id,
        private_key: privateKey,
      }),
    );
    const second = decodeJwt(
      await createJwksAccessProofToken({
        api_server_id,
        private_key: privateKey,
      }),
    );
    expect(first.jti).toBeString();
    expect(second.jti).toBeString();
    expect(first.jti).not.toBe(second.jti);
  });

  describe("hardened claim validation", () => {
    test("accepts a hand-signed assertion with the complete baseline claim set", async () => {
      // Guards the helpers used by the rejection tests below: if this
      // baseline did not verify, the negative tests would pass vacuously.
      const api_server_id: ApiServerId = crypto.randomUUID();
      const { privateKey, publicKey } = await generateTestKeyPair();
      const token = await signClaims(baselineClaims(api_server_id), privateKey);
      const verified = await verifyJwksAccessProofToken({
        token,
        api_server_id,
        public_key: publicKey,
      });
      expect(verified).toBeTrue();
    });

    test("rejects an assertion missing the exp claim", async () => {
      const api_server_id: ApiServerId = crypto.randomUUID();
      const { privateKey, publicKey } = await generateTestKeyPair();
      const claims = baselineClaims(api_server_id);
      delete claims.exp;
      const token = await signClaims(claims, privateKey);
      await expectVerificationToReject(token, api_server_id, publicKey);
    });

    test("rejects an assertion missing the iat claim", async () => {
      const api_server_id: ApiServerId = crypto.randomUUID();
      const { privateKey, publicKey } = await generateTestKeyPair();
      const claims = baselineClaims(api_server_id);
      delete claims.iat;
      const token = await signClaims(claims, privateKey);
      await expectVerificationToReject(token, api_server_id, publicKey);
    });

    test("rejects an assertion missing the jti claim", async () => {
      const api_server_id: ApiServerId = crypto.randomUUID();
      const { privateKey, publicKey } = await generateTestKeyPair();
      const claims = baselineClaims(api_server_id);
      delete claims.jti;
      const token = await signClaims(claims, privateKey);
      await expectVerificationToReject(token, api_server_id, publicKey);
    });

    test("rejects an expired assertion", async () => {
      const api_server_id: ApiServerId = crypto.randomUUID();
      const { privateKey, publicKey } = await generateTestKeyPair();
      const now = Math.floor(Date.now() / 1000);
      const claims: JWTPayload = {
        ...baselineClaims(api_server_id),
        iat: now - 120,
        nbf: now - 120,
        exp: now - 60,
      };
      const token = await signClaims(claims, privateKey);
      await expectVerificationToReject(token, api_server_id, publicKey);
    });

    test("rejects a stale assertion even when its exp claim is in the future", async () => {
      const api_server_id: ApiServerId = crypto.randomUUID();
      const { privateKey, publicKey } = await generateTestKeyPair();
      const now = Math.floor(Date.now() / 1000);
      const claims: JWTPayload = {
        ...baselineClaims(api_server_id),
        // Older than the 60s maxTokenAge window, but with a generous exp:
        // maxTokenAge must reject it regardless of the self-declared exp.
        iat: now - 120,
        nbf: now - 120,
        exp: now + 300,
      };
      const token = await signClaims(claims, privateKey);
      await expectVerificationToReject(token, api_server_id, publicKey);
    });

    test("rejects an assertion with a mismatched aud claim", async () => {
      const api_server_id: ApiServerId = crypto.randomUUID();
      const { privateKey, publicKey } = await generateTestKeyPair();
      const claims: JWTPayload = {
        ...baselineClaims(api_server_id),
        aud: "not-the-schemavaults-auth-server",
      };
      const token = await signClaims(claims, privateKey);
      await expectVerificationToReject(token, api_server_id, publicKey);
    });

    test("rejects an assertion with a mismatched iss claim", async () => {
      const api_server_id: ApiServerId = crypto.randomUUID();
      const { privateKey, publicKey } = await generateTestKeyPair();
      const claims: JWTPayload = {
        ...baselineClaims(api_server_id),
        iss: crypto.randomUUID(),
      };
      const token = await signClaims(claims, privateKey);
      await expectVerificationToReject(token, api_server_id, publicKey);
    });
  });
});
