import { type JWTPayload, type CryptoKey, SignJWT } from "jose";
import JWT_Keys from "./jwt_keys";
import getIssuer from "./get_issuer";
import { getExpiryDurationString } from "./expiry";
import type { AuthTokenTypes } from "@schemavaults/auth-common";
import type { SchemaVaultsAppEnvironment } from "@schemavaults/app-definitions";
import signAndVerifyAlg from "./sign_verify_alg";
import isValidUuid from "@/utils/isValidUuid";

interface BaseSignJSONWebTokenInputOptions<TokenType extends AuthTokenTypes> {
  iat: number;
  uid: string;
  email: string;
  audience: string;
  type: TokenType;
  env: SchemaVaultsAppEnvironment;
  jti?: string;
}

interface SignJSONWebTokenInputWithAllKeysOptions<
  TokenType extends AuthTokenTypes,
> extends BaseSignJSONWebTokenInputOptions<TokenType> {
  jwt_keys: JWT_Keys;
}

interface SignJSONWebTokenInputWithSigningCryptoKeyOptions<
  TokenType extends AuthTokenTypes,
> extends BaseSignJSONWebTokenInputOptions<TokenType> {
  signing_key: CryptoKey;
  keyset_id: string;
}

export type SignJSONWebTokenInputOptions<TokenType extends AuthTokenTypes> =
  | SignJSONWebTokenInputWithAllKeysOptions<TokenType>
  | SignJSONWebTokenInputWithSigningCryptoKeyOptions<TokenType>;

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

  let private_signing_key: CryptoKey;
  let keyset_id: string;
  try {
    if ("jwt_keys" in opts && opts.jwt_keys instanceof JWT_Keys) {
      const jwt_keys: JWT_Keys = opts.jwt_keys;
      const private_key_promise: Promise<CryptoKey> | null =
        jwt_keys.signing_key;
      if (!private_key_promise) {
        throw new Error("Failed to load private signing key from key store!");
      }
      private_signing_key = await private_key_promise;
      keyset_id = jwt_keys.keyset_id;
    } else if ("signing_key" in opts) {
      private_signing_key = opts.signing_key;
      keyset_id = opts.keyset_id;
    } else {
      throw new Error("Neither JWT keys nor signing key provided!");
    }
  } catch (e: unknown) {
    console.error(
      "Failed to load private signing key from key store or input options: ",
      e,
    );
    throw new Error(
      "Failed to load private signing key from key store or input options!",
    );
  }

  if (!isValidUuid(keyset_id)) {
    throw new Error("Invalid keyset ID provided!");
  }

  const signaturePayload: JWTPayload = {
    sub,
    uid,
    type,
    env,
    ...(opts.jti ? { jti: opts.jti } : {}),
  };

  try {
    return await new SignJWT(signaturePayload)
      .setProtectedHeader({
        alg: signAndVerifyAlg,
        keyset_id,
        kid: `${keyset_id}-verification`, // the key needed for verification
      })
      .setAudience(opts.audience)
      .setIssuedAt(opts.iat)
      .setIssuer(getIssuer(env))
      .setExpirationTime(getExpiryDurationString(type))
      .sign(private_signing_key);
  } catch (e: unknown) {
    console.error("Failed to sign JWT: ", e);
    throw new Error("Failed to sign JWT!");
  }
}
