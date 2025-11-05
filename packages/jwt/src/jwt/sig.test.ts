import { describe, it, expect } from "bun:test";
import { signJWT } from "./sign";
import { JWT_Keys } from "./jwt_keys";
import { verifyJWTSignature } from "./verify_signature";
import type { AuthTokenTypes } from "@schemavaults/auth";
import {
  getAppEnvironment,
  SCHEMAVAULTS_AUTH_APP_DEFINITION,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";

const debug: boolean = false;

describe("JWT Signature 'sig' field", async (): Promise<void> => {
  it("can sign and validate a JWT", async () => {
    const jwt_keys: JWT_Keys = await JWT_Keys.createKeys({ debug });

    const iat: number = Date.now();

    const type: AuthTokenTypes = "refresh";
    const audience = SCHEMAVAULTS_AUTH_APP_DEFINITION.app_id satisfies string;
    const email = "jalexwhitman@gmail.com" as const satisfies string;
    const uid: string = crypto.randomUUID();
    const sub: string = uid;
    const env: SchemaVaultsAppEnvironment = getAppEnvironment();

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
});
