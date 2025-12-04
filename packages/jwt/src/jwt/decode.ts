import { type JWTDecryptResult, jwtDecrypt } from "jose";
import type { JWT_Keys } from "./jwt_keys";
import { REFRESH_TOKEN_AUDIENCE } from "./aud";
import { issuer } from "./iss";
import { getExpiryDurationString } from "./expiry";
import { type CustomJWTPayload, jwtPayloadSchema } from "./payload_data";
import type {
  AuthTokenTypes,
  OrganizationID,
  UserData,
} from "@schemavaults/auth-common";
import {
  getAppEnvironment,
  type SchemaVaultsAppEnvironment,
  schemaVaultsAppEnvironmentSchema,
} from "@schemavaults/app-definitions";
import { verifyJWTSignature } from "./verify_signature";

export interface DecodeJWTOptions<T extends AuthTokenTypes> {
  type: T;
  jwt: string;
  jwt_keys: JWT_Keys;
  audience?: string;
  env?: SchemaVaultsAppEnvironment;
}

export async function decodeJWT<T extends AuthTokenTypes>({
  type,
  jwt,
  jwt_keys,
  audience,
  ...opts
}: DecodeJWTOptions<T>): Promise<CustomJWTPayload> {
  const environment: SchemaVaultsAppEnvironment =
    opts.env ?? getAppEnvironment();
  const debug: boolean = environment === "development";

  if (debug) {
    console.log("[decodeJWT] Attempting to decode JWT: ", jwt);
  }

  if (typeof jwt !== "string") {
    throw new Error("Invalid JWT; expected string");
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
    throw new Error(
      "Invalid auth token 'type' (should be 'access'/'refresh')",
    );
  }

  let decodingKey: Uint8Array;
  try {
    const keys = jwt_keys;
    decodingKey = keys.decryption_secret;
  } catch (e: unknown) {
    console.error(e);
    throw new Error("Error getting decoding key");
  }

  const decodeTime: Date = new Date();

  const maxTokenAge = getExpiryDurationString(type);
  if (debug) {
    console.log(`[decodeJWT] Setting max token age to ${maxTokenAge}`);
  }

  const decoded: JWTDecryptResult = await jwtDecrypt(jwt, decodingKey, {
    audience: aud,
    issuer,
    maxTokenAge,
    currentDate: decodeTime,
  });

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
      orgs: OrganizationID[];
    }
  > = { ...decoded.payload };
  delete withoutJWTspecific.iat;
  delete withoutJWTspecific.exp;

  if (!Array.isArray(withoutJWTspecific.orgs)) {
    throw new Error(
      "Expected JWT to have an 'orgs' property, representing organizations that user is a member of!",
    );
  }
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

  const parsed_app_env = await schemaVaultsAppEnvironmentSchema.safeParseAsync(
    payload.env,
  );
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

  try {
    const isValidSig: boolean = await verifyJWTSignature({
      jwt: signature,
      jwt_keys,
      aud,
      iat,
      type,
      sub,
      uid,
      env: environment,
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
