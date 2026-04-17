import {
  type JWTDecryptResult,
  type CryptoKey,
  jwtDecrypt,
  decodeProtectedHeader,
  type ProtectedHeaderParameters,
} from "jose";
import type { I_JWT_Keys } from "./jwt_keys";
import { REFRESH_TOKEN_AUDIENCE } from "./aud";
import { issuer } from "./iss";
import { getExpiryDurationString } from "./expiry";
import { type CustomJWTPayload, jwtPayloadSchema } from "./payload_data";
import type { AuthTokenTypes, UserData } from "@schemavaults/auth-common";
import {
  apiServerIdSchema,
  SCHEMAVAULTS_AUTH_APP_DEFINITION,
  type SchemaVaultsAppEnvironment,
  schemaVaultsAppEnvironmentSchema,
} from "@schemavaults/app-definitions";
import { verifyJWTSignature } from "./verify_signature";
import type { SafeParseReturnType } from "zod";
import isValidUuid from "@/utils/isValidUuid";
import encryptDecryptAlgorithm from "./encrypt_decrypt_alg";

interface BaseDecodeJWTOptions<T extends AuthTokenTypes> {
  type: T;
  jwt: string;
  audience?: string;
  env: SchemaVaultsAppEnvironment;
}

interface DecodeJWTWithAllKeysOptions<
  T extends AuthTokenTypes,
> extends BaseDecodeJWTOptions<T> {
  jwt_keys: I_JWT_Keys;
}

interface DecodeJWTWithOnlyRequiredKeysOptions<
  T extends AuthTokenTypes,
> extends BaseDecodeJWTOptions<T> {
  decryption_key: CryptoKey;
  verification_key: CryptoKey;
  keyset_id: string;
}

export type DecodeJWTOptions<T extends AuthTokenTypes> =
  | DecodeJWTWithAllKeysOptions<T>
  | DecodeJWTWithOnlyRequiredKeysOptions<T>;

export async function decodeJWT<T extends AuthTokenTypes>({
  type,
  jwt,
  audience = type === "refresh"
    ? SCHEMAVAULTS_AUTH_APP_DEFINITION.app_id
    : undefined,
  ...opts
}: DecodeJWTOptions<T>): Promise<CustomJWTPayload> {
  const environment: SchemaVaultsAppEnvironment = opts.env;
  if (!environment) {
    throw new Error("Invalid app environment to decode JWT within");
  }
  const debug: boolean = environment === "development";

  if (debug) {
    console.log("[decodeJWT] Attempting to decode JWT: ", jwt);
  }

  if (!audience || typeof audience !== "string") {
    throw new TypeError("Invalid audience; expected string");
  }

  let keyset_id: string;
  try {
    if ("keyset_id" in opts) {
      keyset_id = opts.keyset_id;
    } else if ("jwt_keys" in opts) {
      keyset_id = opts.jwt_keys.keyset_id;
    } else {
      throw new Error("Failed to retrieve keyset ID from input options");
    }
    if (!isValidUuid(keyset_id)) {
      throw new Error("Invalid keyset ID; not a valid UUID!");
    }
  } catch (error: unknown) {
    console.error("Failed to retrieve keyset ID:", error);
    throw new Error("Failed to retrieve keyset ID");
  }

  if (typeof jwt !== "string") {
    throw new Error("Invalid JWT; expected string");
  }

  if (
    type === "refresh" &&
    audience !== SCHEMAVAULTS_AUTH_APP_DEFINITION.app_id
  ) {
    if (debug) {
      console.log("Invalid audience for refresh token: ", audience);
    }
    throw new Error(
      `Invalid audience for refresh token; only '${SCHEMAVAULTS_AUTH_APP_DEFINITION.app_id}' is valid.`,
    );
  }

  let aud: string;
  if (type === "refresh") {
    aud = REFRESH_TOKEN_AUDIENCE;
  } else if (type === "access") {
    if (typeof audience !== "string") {
      throw new Error("Missing audience for JWT to decode with");
    }
    aud = audience;
  } else {
    throw new Error("Invalid auth token 'type' (should be 'access'/'refresh')");
  }

  const decodeTime: Date = new Date();

  const maxTokenAge: string = getExpiryDurationString(type);
  if (debug) {
    console.log(`[decodeJWT] Setting max token age to ${maxTokenAge}`);
  }

  let kid: string;
  let alg: string;
  let decoded_header_aud: string;
  try {
    const decoded_header: ProtectedHeaderParameters =
      decodeProtectedHeader(jwt);
    if (!decoded_header.kid || typeof decoded_header.kid !== "string") {
      throw new Error("Missing 'kid' in JWT header");
    }
    kid = decoded_header.kid;
    if (!decoded_header.alg || typeof decoded_header.alg !== "string") {
      throw new Error("Missing 'alg' in JWT header");
    }
    alg = decoded_header.alg;
    if (
      !decoded_header.keyset_id ||
      typeof decoded_header.keyset_id !== "string"
    ) {
      throw new Error("Missing 'keyset_id' in JWT header");
    }
    if (decoded_header.keyset_id !== keyset_id) {
      throw new Error(
        "Invalid keyset_id in JWT header; mismatch with input decryption key",
      );
    }

    if (
      !decoded_header.aud ||
      typeof decoded_header.aud !== "string" ||
      !apiServerIdSchema.safeParse(decoded_header.aud).success
    ) {
      throw new Error("Invalid audience in JWT header");
    }

    if (
      type === "refresh" &&
      decoded_header.aud !== SCHEMAVAULTS_AUTH_APP_DEFINITION.app_id
    ) {
      throw new Error(
        `Invalid audience in JWT header; only '${SCHEMAVAULTS_AUTH_APP_DEFINITION.app_id}' tokens are allowed here`,
      );
    }

    if (decoded_header.aud !== audience) {
      throw new Error(
        `Invalid audience in JWT header; only '${audience}' tokens are allowed here`,
      );
    }
    decoded_header_aud = decoded_header.aud;
  } catch (e: unknown) {
    console.error("Error decoding JWT header: ", e);
    throw new Error("Error decoding JWT header!");
  }

  if (kid !== `${keyset_id}-decryption`) {
    throw new Error(
      "Invalid kid in JWT header; mismatch with input decryption key",
    );
  }

  if (alg !== encryptDecryptAlgorithm) {
    throw new Error("Invalid algorithm header for JWT decryption");
  }

  let decryption_key: CryptoKey;
  try {
    if ("jwt_keys" in opts) {
      decryption_key = await opts.jwt_keys.decryption_key;
    } else if ("decryption_key" in opts) {
      decryption_key = opts.decryption_key;
    } else {
      throw new Error("Missing decryption key for JWT to decode with");
    }
  } catch (e: unknown) {
    console.error("Error loading decryption key from key store or inputs: ", e);
    throw new Error("Error loading decryption key from key store or inputs!");
  }

  const decoded: JWTDecryptResult = await jwtDecrypt(jwt, decryption_key, {
    audience: aud,
    issuer,
    maxTokenAge,
    currentDate: decodeTime,
  });

  if (decoded.payload.aud !== decoded_header_aud) {
    throw new Error("Mismatch in header 'aud' and 'aud' in JWT payload");
  }

  if (debug) {
    console.log("[decodeJWT] Decoded JWT: ", decoded);
  }

  const iat: number | undefined = decoded.payload.iat;
  if (typeof iat !== "number" || isNaN(iat)) {
    throw new Error("Decoded JWT is missing iat property!");
  }

  const withoutJWTspecific: Partial<
    UserData & {
      iat: number;
      exp: number;
      aud: string | string[];
      iss: string;
    }
  > = { ...decoded.payload };
  delete withoutJWTspecific.iat;
  delete withoutJWTspecific.exp;

  const parsedPayload =
    await jwtPayloadSchema.safeParseAsync(withoutJWTspecific);
  if (!parsedPayload.success) {
    if (environment === "development") {
      console.error("[decodeJWT] Error validating JWT payload with schema");
      parsedPayload.error.issues.forEach((issue) => {
        console.error("[decodeJWT] Validation Error: ", issue);
      });
      console.error(parsedPayload.error);
    }
    throw new Error(
      `Error parsing JWT payload: ${parsedPayload.error.errors
        .map((e) => e.message)
        .join(", ")}`,
    );
  }

  const payload: CustomJWTPayload = parsedPayload.data;

  if (!payload.env || typeof payload.env !== "string") {
    throw new Error("Missing 'env' field in JWT payload!");
  }

  const parsed_app_env: SafeParseReturnType<
    SchemaVaultsAppEnvironment,
    SchemaVaultsAppEnvironment
  > = await schemaVaultsAppEnvironmentSchema.safeParseAsync(payload.env);
  if (!parsed_app_env.success) {
    throw new Error(
      "Invalid app environment within 'env' field of JWT payload!",
    );
  }

  if (environment !== payload.env) {
    console.log("Server app environment: ", environment);
    console.log("JWT 'env' field: ", payload.env);
    throw new Error(
      "Payload 'env' field does not match server app environment!",
    );
  }

  const signature: string = payload.sig;
  if (!signature || typeof signature !== "string") {
    throw new Error("JWT 'sig' field is missing or not a string!");
  }

  const sub: string = payload.sub;
  const uid: string = payload.uid;
  if (typeof uid !== "string" || typeof sub !== "string" || uid !== sub) {
    throw new Error("Sub and UID must be strings and should be equal!");
  }

  let verification_key: CryptoKey;
  try {
    if ("jwt_keys" in opts) {
      verification_key = await opts.jwt_keys.verification_key;
    } else if ("verification_key" in opts) {
      verification_key = opts.verification_key;
    } else {
      throw new Error("Missing verification key for JWT to decode with");
    }
  } catch (e: unknown) {
    console.error(
      "Error loading verification key from key store or inputs: ",
      e,
    );
    throw new Error("Error loading verification key from key store or inputs!");
  }

  try {
    const isValidSig: boolean = await verifyJWTSignature({
      jwt: signature,
      verification_key,
      keyset_id,
      aud,
      iat,
      type,
      sub,
      uid,
      env: environment,
      ...(payload.jti ? { jti: payload.jti } : {}),
    });
    if (!isValidSig) {
      throw new Error("Invalid JWT signature!");
    }
  } catch (e: unknown) {
    if (debug) {
      console.error(
        "Failed to verify 'sig' field of JWT using public key: ",
        e,
      );
    }
    throw new Error("Failed to verify 'sig' field of JWT using public key!");
  }

  return payload;
}
