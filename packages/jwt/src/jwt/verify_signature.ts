import {
  type JWTPayload,
  jwtVerify,
  type JWTVerifyResult,
  type CryptoKey,
  decodeProtectedHeader,
  ProtectedHeaderParameters,
} from "jose";
import { JWT_Keys } from "./jwt_keys";
import getIssuer from "./get_issuer";
import type { AuthTokenTypes } from "@schemavaults/auth-common";
import type { SchemaVaultsAppEnvironment } from "@schemavaults/app-definitions";
import isValidUuid from "@/utils/isValidUuid";
import signVerifyAlg from "./sign_verify_alg";

interface BaseVerifyJWTSignatureInputOptions<TokenType extends AuthTokenTypes> {
  jwt: string;
  aud: string;
  iat: number;
  type: TokenType;
  sub: string;
  uid: string;
  env: SchemaVaultsAppEnvironment;
  jti?: string;
}

interface VerifyJWTSignatureInputWithAllKeysOptions<
  TokenType extends AuthTokenTypes,
> extends BaseVerifyJWTSignatureInputOptions<TokenType> {
  jwt_keys: JWT_Keys;
}

interface VerifyJWTSignatureInputWithVerificationKeyOptions<
  TokenType extends AuthTokenTypes,
> extends BaseVerifyJWTSignatureInputOptions<TokenType> {
  verification_key: CryptoKey;
  keyset_id: string;
}

export type VerifyJWTSignatureInputOptions<TokenType extends AuthTokenTypes> =
  | VerifyJWTSignatureInputWithAllKeysOptions<TokenType>
  | VerifyJWTSignatureInputWithVerificationKeyOptions<TokenType>;

export async function verifyJWTSignature<TokenType extends AuthTokenTypes>({
  jwt,
  ...opts
}: VerifyJWTSignatureInputOptions<TokenType>): Promise<boolean> {
  if (typeof opts.aud !== "string") {
    console.error("Did not receive an audience option!");
    return false;
  }

  if (!opts.sub || !opts.uid || opts.sub !== opts.uid) {
    throw new Error("Invalid sub/uid field for jwt!");
  }

  let verification_key: CryptoKey;
  let keyset_id: string;
  try {
    if ("jwt_keys" in opts && opts.jwt_keys instanceof JWT_Keys) {
      const verifierKeyPromise: Promise<CryptoKey> =
        opts.jwt_keys.verification_key;
      verification_key = await verifierKeyPromise;
      keyset_id = opts.jwt_keys.keyset_id;
    } else if ("verification_key" in opts) {
      verification_key = opts.verification_key;
      keyset_id = opts.keyset_id;
    } else {
      throw new Error("Invalid input options, missing verification key!");
    }
  } catch (e: unknown) {
    console.error(
      "Failed to retrieve verification key from key store or input options: ",
      e,
    );
    throw new Error(
      "Failed to retrieve verification key from key store or input options!",
    );
  }

  if (!isValidUuid(keyset_id)) {
    throw new Error("Invalid keyset id!");
  }

  let alg: string;
  let kid: string;
  try {
    const header: ProtectedHeaderParameters = decodeProtectedHeader(jwt);
    if (!header.alg || typeof header.alg !== "string") {
      throw new Error("Missing 'alg' claim in protected header!");
    }
    alg = header.alg;
    if (!header.kid || typeof header.kid !== "string") {
      throw new Error("Missing 'kid' claim in protected header!");
    }
    kid = header.kid;
    if (header.keyset_id !== keyset_id) {
      throw new Error(
        "Invalid keyset id; mismatch between 'keyset_id' in header and keyset ID associated with verification key!",
      );
    }
  } catch (e: unknown) {
    console.error("Failed to decode protected header: ", e);
    throw new Error("Failed to decode protected header!");
  }

  if (alg !== signVerifyAlg) {
    throw new Error(
      "Invalid algorithm; mismatch between 'alg' in header and algorithm associated with verification key!",
    );
  }

  if (kid !== `${keyset_id}-verification`) {
    throw new Error(
      "Invalid key id; mismatch between 'kid' in header and key ID associated with verification key!",
    );
  }

  const issuer: string = getIssuer(opts.env);

  try {
    const verify_result: JWTVerifyResult<JWTPayload> = await jwtVerify(
      jwt,
      verification_key,
      {
        audience: opts.aud,
        issuer,
        subject: opts.sub,
        algorithms: [signVerifyAlg],
      },
    );

    if (verify_result.payload.aud !== opts.aud) {
      throw new Error("Decoded payload does not match input audience!");
    }

    if (verify_result.payload.iss !== issuer) {
      throw new Error("Unexpected 'iss' claim in signature token!");
    }

    if (verify_result.payload.env !== opts.env) {
      throw new Error("App environment mismatch!");
    }

    if (opts.jti && verify_result.payload.jti !== opts.jti) {
      throw new Error("JTI mismatch between outer token and signature!");
    }
  } catch (e: unknown) {
    console.error("Failed to verify jwt signature: ", e);
    return false;
  }

  return true;
}
