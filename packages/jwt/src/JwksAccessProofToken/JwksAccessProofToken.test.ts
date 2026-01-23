import { describe, expect, test } from "bun:test";
import createJwksAccessProofToken from "./createJwksAccessProofToken";
import {
  ApiServerId,
  SCHEMAVAULTS_AUTH_SERVER,
  SCHEMAVAULTS_MAIL_SERVER,
  SCHEMAVAULTS_REGISTRY_SERVER,
} from "@schemavaults/app-definitions";
import { PEMFormat, SigningKeyPairFactory } from "@/jwt/jwt_keys";
import { importPKCS8, importSPKI } from "jose";
import { sign_verify_alg } from "@/jwt/sign_verify_alg";
import verifyJwksAccessProofToken from "./verifyJwksAccessProofToken";

const DEBUG: boolean = false;

async function testCreateAndVerifyForApiServerId(
  api_server_id: ApiServerId,
): Promise<void> {
  const [privateKey, publicKey] = await new SigningKeyPairFactory().generate(
    "pem",
  );
  expect(PEMFormat.isPemFormat(privateKey, "PRIVATE")).toBeTrue();
  expect(PEMFormat.isPemFormat(publicKey, "PUBLIC")).toBeTrue();

  if (DEBUG) {
    console.log("Private Key:\n");
    console.log(privateKey);
    console.log("Public Key:\n");
    console.log(publicKey);
  }

  const token = await createJwksAccessProofToken({
    api_server_id,
    private_key: await importPKCS8(privateKey, sign_verify_alg),
  });
  expect(token).toBeString();

  const result = await verifyJwksAccessProofToken({
    api_server_id,
    public_key: await importSPKI(publicKey, sign_verify_alg),
    token,
  });
  expect(result).toBeTrue();
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
});
