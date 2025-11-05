import { jwtVerify } from "jose";
import type { JWT_Keys } from "./jwt_keys";
import { issuer } from "./iss";
import type { AuthTokenTypes } from "@schemavaults/auth";
import type { SchemaVaultsAppEnvironment } from "@schemavaults/app-definitions";

export interface VerifyJWTSignatureInputOptions {
  jwt: string;
  jwt_keys: JWT_Keys;
  aud: string;
  iat: number;
  type: AuthTokenTypes;
  sub: string;
  uid: string;
  env: SchemaVaultsAppEnvironment;
}

export async function verifyJWTSignature({
  jwt,
  jwt_keys,
  ...opts
}: VerifyJWTSignatureInputOptions): Promise<boolean> {
  if (typeof opts.aud !== "string") {
    console.error("Did not receive an audience option!");
    return false;
  }

  if (!opts.sub || !opts.uid || opts.sub !== opts.uid) {
    throw new Error("Invalid sub/uid field for jwt!");
  }

  try {
    const publicKey = jwt_keys.public_signing_verifier;

    const verify_result = await jwtVerify(jwt, publicKey, {
      audience: opts.aud,
      issuer,
      subject: opts.sub,
    });

    if (verify_result.payload.aud !== opts.aud) {
      throw new Error("Decoded payload does not match input audience!");
    }

    if (verify_result.payload.iss !== issuer) {
      throw new Error("Unexpected 'iss' claim in signature token!");
    }

    if (verify_result.payload.env !== opts.env) {
      throw new Error("App environment mismatch!");
    }
  } catch (e: unknown) {
    console.error("Failed to verify jwt signature: ", e);
    return false;
  }

  return true;
}
