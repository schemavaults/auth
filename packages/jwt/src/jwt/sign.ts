import { type JWTPayload, type KeyLike, SignJWT } from "jose";
import type { JWT_Keys } from "./jwt_keys";
import { issuer } from "./iss";
import { getExpiryDurationString } from "./expiry";
import type { AuthTokenTypes } from "@schemavaults/auth-common";
import type { SchemaVaultsAppEnvironment } from "@schemavaults/app-definitions";
import signAndVerifyAlg from "./sign_verify_alg";

export interface SignJSONWebTokenInputOptions<
  TokenType extends AuthTokenTypes,
> {
  iat: number;
  uid: string;
  email: string;
  jwt_keys: JWT_Keys;
  audience: string;
  type: TokenType;
  env: SchemaVaultsAppEnvironment;
}

export async function signJWT<TokenType extends AuthTokenTypes>(
  opts: SignJSONWebTokenInputOptions<TokenType>,
): Promise<string> {
  const type: TokenType = opts.type;
  const uid: string = opts.uid;
  const sub: string = uid;

  if (typeof uid !== "string" || typeof sub !== "string" || uid !== sub) {
    throw new Error("uid and sub must be defined and equal strings");
  }

  const env = opts.env;

  const jwt_keys: JWT_Keys = opts.jwt_keys;

  let private_signing_key: KeyLike;
  try {
    const private_key_promise: Promise<KeyLike> | null = jwt_keys.signing_key;
    if (!private_key_promise) {
      throw new Error("Failed to load private signing key from key store!")
    }
    private_signing_key = await private_key_promise;
  } catch (e: unknown) {
    console.error("Failed to load private signing key from key store: ", e);
    throw new Error("Failed to load private signing key from key store!");
  }

  const signaturePayload: JWTPayload = {
    sub,
    uid,
    type,
    env,
  };

  try {
    return await new SignJWT(signaturePayload)
      .setProtectedHeader({ alg: signAndVerifyAlg })
      .setAudience(opts.audience)
      .setIssuedAt(opts.iat)
      .setIssuer(issuer)
      .setExpirationTime(getExpiryDurationString(type))
      .sign(private_signing_key);
  } catch (e: unknown) {
    console.error("Failed to sign JWT: ", e);
    throw new Error("Failed to sign JWT!");
  }
}
