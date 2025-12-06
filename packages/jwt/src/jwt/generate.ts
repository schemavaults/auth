import { EncryptJWT, type CryptoKey } from "jose";
import JWT_Keys from "./jwt_keys";
import { alg, enc } from "./encrypt_decrypt_alg";
import { issuer } from "./iss";
import { REFRESH_TOKEN_AUDIENCE } from "./aud";
import { getExpiryDurationString, getExpiryTime } from "./expiry";
import type { CustomJWTPayload } from "./payload_data";
import {
  type UserData,
  type AccessToken,
  type AuthToken,
  type AuthTokenTypes,
  type RefreshToken,
  type OrganizationID,
  organizationIdSchema,
} from "@schemavaults/auth-common";
import { signJWT } from "./sign";
import type { SchemaVaultsAppEnvironment } from "@schemavaults/app-definitions";
import isValidUuid from "@/utils/isValidUuid";

interface BaseGenerateJWTOptions<T extends AuthTokenTypes> {
  user: UserData;
  type: T;
  iat: number;
  client_app_id: string;
  audience: string;
  env: SchemaVaultsAppEnvironment;
  orgs: readonly OrganizationID[];
}

interface GenerateJWTWithAllKeysOptions<T extends AuthTokenTypes> extends BaseGenerateJWTOptions<T> {
  jwt_keys: JWT_Keys;
}

interface GenerateJWTWithOnlyRequiredKeysOptions<T extends AuthTokenTypes> extends BaseGenerateJWTOptions<T> {
  encryption_key: CryptoKey;
  signing_key: CryptoKey;
  keyset_id: string;
}

export type GenerateJWTOptions<T extends AuthTokenTypes> = GenerateJWTWithAllKeysOptions<T> | GenerateJWTWithOnlyRequiredKeysOptions<T>;

const organizationIdsSchema = organizationIdSchema.array().readonly();

/**
 *
 * @param userData
 * @param type Access or refresh token
 * @param iat Current unix timestamp
 * @returns A JWT (string)
 */
export async function generateJWT<T extends AuthTokenTypes>(
  {
    type,
    user,
    iat,
    client_app_id,
    audience,
    ...opts
  }: GenerateJWTOptions<T>,
  refresh_token_audience = REFRESH_TOKEN_AUDIENCE,
): Promise<T extends "access" ? AccessToken : RefreshToken> {

  let keyset_id: string;
  try {
    if ("keyset_id" in opts) {
      keyset_id = opts.keyset_id;
    } else if ("jwt_keys" in opts && opts.jwt_keys instanceof JWT_Keys) {
      keyset_id = opts.jwt_keys.keyset_id
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
        `Audience for a refresh token must be the auth server. Received "${audience}", but expected "${refresh_token_audience}".`,
      );
    } else {
      aud = refresh_token_audience;
    }
  } else if (type === "access") {
    if (typeof audience !== "string") {
      throw new Error("An audience must be supplied for access tokens");
    }
    aud = audience;
  } else {
    throw new Error("Invalid token type");
  }

  const email: string = user.email;
  const uid: string = user.uid;

  const env: SchemaVaultsAppEnvironment = opts.env;

  const parsed_organization_ids = await organizationIdsSchema.safeParseAsync(
    opts.orgs,
  );
  if (!parsed_organization_ids.success) {
    console.error(
      "Received invalid list of organization IDs that user is a member of: ",
      parsed_organization_ids.error,
    );
    throw new Error(
      "Received invalid list of organization IDs that user is a member of!",
    );
  }
  const orgs: readonly OrganizationID[] = parsed_organization_ids.data;

  let signing_key: CryptoKey;
  try {
    if ("jwt_keys" in opts && opts.jwt_keys instanceof JWT_Keys) {
      const signing_key_promise: Promise<CryptoKey> | null = opts.jwt_keys.signing_key;
      if (!signing_key_promise) {
        throw new Error("Failed to load signing key from key store!")
      }
      signing_key = await signing_key_promise;
    } else if ("signing_key" in opts) {
      signing_key = opts.signing_key;
    } else {
      throw new Error("Did not receive signing key from key store or input options!")
    }
  } catch (e: unknown) {
    console.error("Failed to load encryption key from key store or input options: ", e);
    throw new Error("Failed to load encryption key from key store or input options!");
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
      orgs
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
    if ("jwt_keys" in opts && opts.jwt_keys instanceof JWT_Keys) {
      const encryption_key_promise: Promise<CryptoKey> | null = opts.jwt_keys.encryption_key;
      if (!encryption_key_promise) {
        throw new Error("Failed to load encryption key from key store!")
      }
      encryption_key = await encryption_key_promise;
    } else if ("encryption_key" in opts) {
      encryption_key = opts.encryption_key;
    } else {
      throw new Error("Did not receive encryption key from key store or input options!")
    }
  } catch (e: unknown) {
    console.error("Failed to load encryption key from key store or input options: ", e);
    throw new Error("Failed to load encryption key from key store or input options!");
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
      orgs: orgs,
    };

    const jwt = await new EncryptJWT(additionalClaims)
      .setProtectedHeader({ alg, enc, keyset_id, kid: `${keyset_id}-decryption` })
      .setIssuedAt(new Date(iat))
      .setIssuer(issuer)
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
    };

    return tokenData as T extends "access" ? AccessToken : RefreshToken;
  } catch (error: unknown) {
    console.error("Error generating JWT: ", error);
    throw new Error("Error generating JWT!");
  }
}
