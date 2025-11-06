import { JWTPayload, SignJWT } from "jose";
import { JWT_Keys } from "./jwt_keys";
import { issuer } from "./iss";
import { getExpiryDurationString } from "./expiry";
import { AuthTokenTypes } from "@schemavaults/auth-common";
import { SchemaVaultsAppEnvironment } from "@schemavaults/app-definitions";

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

  const jwt_keys = opts.jwt_keys;

  const alg = "RS256";

  const private_key = jwt_keys.private_signing_secret;

  const signaturePayload: JWTPayload = {
    sub,
    uid,
    type,
    env,
  };

  try {
    return await new SignJWT(signaturePayload)
      .setProtectedHeader({ alg })
      .setAudience(opts.audience)
      .setIssuedAt(opts.iat)
      .setIssuer(issuer)
      .setExpirationTime(getExpiryDurationString(type))
      .sign(private_key);
  } catch (e: unknown) {
    console.error("Failed to sign JWT: ", e);
    throw new Error("Failed to sign JWT!");
  }
}
