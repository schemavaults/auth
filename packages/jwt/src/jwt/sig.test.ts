import { describe, it, expect } from "bun:test";
import { signJWT } from "./sign";
import { generateNewJwtKeySet, type JWT_Keys } from "./jwt_keys";
import { verifyJWTSignature } from "./verify_signature";
import type { AuthTokenTypes } from "@schemavaults/auth-common";
import { decodeProtectedHeader, type ProtectedHeaderParameters } from "jose";
import signVerifyAlgorithm from "./sign_verify_alg";
import {
  getAuthServerUrl,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";

const iat: number = Date.now();
const type: AuthTokenTypes = "refresh";
const audience: string = getAuthServerUrl();
const email = "jalexwhitman@gmail.com" as const satisfies string;
const uid: string = crypto.randomUUID();
const sub: string = uid;
const env: SchemaVaultsAppEnvironment = "test";

describe("JWT Signature 'sig' field", async (): Promise<void> => {
  it("can sign a JWT", async () => {
    const jwt_keys: JWT_Keys = await generateNewJwtKeySet({
      audience_id: audience,
    });
    const sig: string = await signJWT({
      jwt_keys,
      audience,
      iat,
      email,
      uid,
      type,
      env,
    });
    expect(sig).toBeString();
    expect(sig.length).toBeGreaterThan(0);
  });

  it("can sign and validate a JWT", async () => {
    const jwt_keys: JWT_Keys = await generateNewJwtKeySet({
      audience_id: audience,
    });

    const sig: string = await signJWT({
      jwt_keys,
      audience,
      iat,
      email,
      uid,
      type,
      env,
    });

    const result: boolean = await verifyJWTSignature({
      jwt_keys,
      jwt: sig,
      aud: audience,
      iat,
      type,
      sub,
      uid,
      env,
    });

    expect(result).toBeTrue();
  });

  it("can sign a JWT with just the signing key", async () => {
    const jwt_keys: JWT_Keys = await generateNewJwtKeySet({
      audience_id: audience,
    });
    const keyset_id: string = jwt_keys.keyset_id;
    const signing_key_promise: Promise<CryptoKey> | null = jwt_keys.signing_key;
    if (!signing_key_promise) {
      throw new Error("Signing key not found in generated keyset!");
    }
    const signing_key: CryptoKey = await signing_key_promise;
    const sig: string = await signJWT({
      signing_key,
      keyset_id,
      audience,
      iat,
      email,
      uid,
      type,
      env,
    });
    expect(sig).toBeString();
    expect(sig.length).toBeGreaterThan(0);
    const header: ProtectedHeaderParameters = decodeProtectedHeader(sig);
    expect(header.alg).toBeString();
    expect(header.alg).toBe(signVerifyAlgorithm);
    expect(header.keyset_id).toBeString();
    expect(header.keyset_id).toBe(keyset_id);
  });
});
