import { EncryptJWT, type CryptoKey } from "jose";
import type { I_JWT_Keys } from "./jwt_keys";
import { alg, enc } from "./encrypt_decrypt_alg";
import getIssuer from "./get_issuer";
import getRefreshTokenAudience from "./get_refresh_token_audience";
import { getExpiryDurationString, getExpiryTime } from "./expiry";
import type { CustomJWTPayload } from "./payload_data";
import {
  type UserData,
  type AccessToken,
  type AuthToken,
  type AuthTokenTypes,
  type RefreshToken,
} from "@schemavaults/auth-common";
import { signJWT } from "./sign";
import {
  apiServerIdSchema,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import isValidUuid from "@/utils/isValidUuid";

interface BaseGenerateJWTOptions<T extends AuthTokenTypes> {
  user: UserData;
  type: T;
  iat: number;
  client_app_id: string;
  audience: string;
  auth_server_url: string;
  env: SchemaVaultsAppEnvironment;
}

interface GenerateJWTWithAllKeysOptions<
  T extends AuthTokenTypes,
> extends BaseGenerateJWTOptions<T> {
  jwt_keys: I_JWT_Keys;
}

interface GenerateJWTWithOnlyRequiredKeysOptions<
  T extends AuthTokenTypes,
> extends BaseGenerateJWTOptions<T> {
  encryption_key: CryptoKey;
  signing_key: CryptoKey;
  keyset_id: string;
}

export type GenerateJWTOptions<T extends AuthTokenTypes> =
  | GenerateJWTWithAllKeysOptions<T>
  | GenerateJWTWithOnlyRequiredKeysOptions<T>;

/**
 *
 * @param opts
 * @param type Access or refresh token
 * @param iat Current unix timestamp
 * @returns A JWT (AccessToken or RefreshToken object). The .token property contains the actual token as a string.
 */
export async function generateJWT<T extends AuthTokenTypes>(
  {
    type,
    user,
    iat,
    client_app_id,
    audience,
    auth_server_url,
    ...opts
  }: GenerateJWTOptions<T>,
  refresh_token_audience = getRefreshTokenAudience(opts.env),
): Promise<T extends "access" ? AccessToken : RefreshToken> {
  let keyset_id: string;
  try {
    if ("keyset_id" in opts) {
      keyset_id = opts.keyset_id;
    } else if ("jwt_keys" in opts) {
      keyset_id = opts.jwt_keys.keyset_id;
    } else {
      throw new Error("Failed to parse 'keyset_id' from options!");
    }
    if (!isValidUuid(keyset_id)) {
      throw new Error("Invalid 'keyset_id' provided; not a valid uuid!");
    }
  } catch (e: unknown) {
    console.error("Error parsing 'keyset_id' from options: ", e);
    throw new Error("Error parsing 'keyset_id' from options!");
  }

  const userData: UserData = user;
  let aud: string;
  if (type === "refresh") {
    if (typeof audience !== "string" || audience !== refresh_token_audience) {
      throw new Error(
        `Audience for a refresh token must be the auth server. ` +
          `Received "${audience}", but expected "${refresh_token_audience}".`,
      );
    } else {
      aud = refresh_token_audience;
    }
  } else if (type === "access") {
    if (typeof audience !== "string") {
      throw new TypeError("An audience must be supplied for access tokens");
    }

    if (!apiServerIdSchema.safeParse(audience).success) {
      throw new TypeError(
        "Invalid audience provided; not a valid API server ID!",
      );
    }

    aud = audience;
  } else {
    throw new TypeError(
      "Invalid token type; expected 'type' to be 'access' or 'refresh'",
    );
  }

  if ("jwt_keys" in opts) {
    const keyset_audience_id: string = opts.jwt_keys.audience_id;
    if (
      typeof keyset_audience_id !== "string" ||
      !apiServerIdSchema.safeParse(keyset_audience_id).success
    ) {
      throw new TypeError(
        "Invalid audience ID for JWT keyset; not a valid API server ID!",
      );
    }

    if (keyset_audience_id !== aud) {
      throw new Error(
        `JWT keyset audience ID '${keyset_audience_id}' does not match requested token audience ID '${aud}'`,
      );
    }
  }

  const email: string = user.email;
  const uid: string = user.uid;

  const env: SchemaVaultsAppEnvironment = opts.env;

  if (type === "refresh" && audience !== auth_server_url) {
    throw new Error("Invalid audience for refresh token", {
      cause: `Only auth server URL audience ('${auth_server_url}') is valid for refresh tokens.`,
    });
  }

  const jti: string = crypto.randomUUID();

  let signing_key: CryptoKey;
  try {
    if ("jwt_keys" in opts) {
      const signing_key_promise: Promise<CryptoKey> | null =
        opts.jwt_keys.signing_key;
      if (!signing_key_promise) {
        throw new Error("Failed to load signing key from key store!");
      }
      signing_key = await signing_key_promise;
    } else if ("signing_key" in opts) {
      signing_key = opts.signing_key;
    } else {
      throw new Error(
        "Did not receive signing key from key store or input options!",
      );
    }
  } catch (e: unknown) {
    console.error(
      "Failed to load encryption key from key store or input options: ",
      e,
    );
    throw new Error(
      "Failed to load encryption key from key store or input options!",
    );
  }

  let sig: string;
  try {
    sig = await signJWT({
      audience,
      signing_key,
      keyset_id,
      iat,
      uid,
      email,
      type,
      env,
      jti,
    });
  } catch (e: unknown) {
    console.error(
      "Failed to generate signature token for 'sig' field of JWT: ",
      e,
    );
    throw new Error(
      "Failed to generate signature token for 'sig' field of JWT!",
    );
  }

  let encryption_key: CryptoKey;
  try {
    if ("jwt_keys" in opts) {
      const encryption_key_promise: Promise<CryptoKey> | null =
        opts.jwt_keys.encryption_key;
      if (!encryption_key_promise) {
        throw new Error("Failed to load encryption key from key store!");
      }
      encryption_key = await encryption_key_promise;
    } else if ("encryption_key" in opts) {
      encryption_key = opts.encryption_key;
    } else {
      throw new Error(
        "Did not receive encryption key from key store or input options!",
      );
    }
  } catch (e: unknown) {
    console.error(
      "Failed to load encryption key from key store or input options: ",
      e,
    );
    throw new Error(
      "Failed to load encryption key from key store or input options!",
    );
  }

  try {
    const additionalClaims: Partial<CustomJWTPayload> = {
      uid: user.uid,
      admin: user.admin ?? false,
      email: user.email,
      email_verified: user.email_verified ?? false,
      aud: audience,
      app: client_app_id,
      disabled: user.disabled ?? false,
      created_at: user.created_at,
      env,
      sig,
      jti,
    };

    const jwt = await new EncryptJWT(additionalClaims)
      .setProtectedHeader({
        alg,
        enc,
        keyset_id,
        kid: `${keyset_id}-decryption`,
        aud: audience satisfies string,
      })
      .setIssuedAt(new Date(iat))
      .setIssuer(auth_server_url)
      .setAudience(aud)
      .setExpirationTime(getExpiryDurationString(type))
      .setSubject(userData.uid)
      .encrypt(encryption_key);

    const expiryTime: number = getExpiryTime(type, iat);

    if (env === "development") {
      console.log(`[generateJWT] Generated ${type} JWT: `, jwt);
    }

    const tokenData: AuthToken = {
      type,
      uid: userData.uid,
      iat,
      exp: expiryTime,
      token: jwt,
      aud,
      jti,
    };

    if (typeof tokenData.token !== "string") {
      throw new TypeError(
        "Expected '.token' property of generated token object to be a string!",
      );
    }

    return tokenData as T extends "access" ? AccessToken : RefreshToken;
  } catch (error: unknown) {
    console.error("Error generating JWT: ", error);
    throw new Error("Error generating JWT!");
  }
}
