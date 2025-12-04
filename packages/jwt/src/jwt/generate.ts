import { EncryptJWT } from "jose";
import type { JWT_Keys } from "./jwt_keys";
import { alg, enc } from "./alg";
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

export interface GenerateJWTOptions<T extends AuthTokenTypes> {
  user: UserData;
  type: T;
  iat: number;
  client_app_id: string;
  audience: string;
  jwt_keys: JWT_Keys;
  env: SchemaVaultsAppEnvironment;
  orgs: readonly OrganizationID[];
}

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
    jwt_keys,
    ...opts
  }: GenerateJWTOptions<T>,
  refresh_token_audience = REFRESH_TOKEN_AUDIENCE,
): Promise<T extends "access" ? AccessToken : RefreshToken> {
  const userData: UserData = user;
  let aud: string;
  if (type === "refresh") {
    if (typeof audience !== "string" || audience !== refresh_token_audience) {
      throw new Error(
        `Audience for a refresh token must be the auth server. Received "${audience}", expected "${refresh_token_audience}"`,
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

  let sig: string;
  try {
    sig = await signJWT({
      audience,
      jwt_keys,
      iat,
      uid,
      email,
      type,
      env,
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

  try {
    const secret: Uint8Array = jwt_keys.encryption_secret;

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
      .setProtectedHeader({ alg, enc })
      .setIssuedAt(new Date(iat))
      .setIssuer(issuer)
      .setAudience(aud)
      .setExpirationTime(getExpiryDurationString(type))
      .setSubject(userData.uid)
      .encrypt(secret);

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
  } catch (error) {
    console.error(error);
    throw new Error("Error generating JWT");
  }
}
