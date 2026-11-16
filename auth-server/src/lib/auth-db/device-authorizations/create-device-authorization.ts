import "server-only";
import type { Kysely } from "@schemavaults/dbh";
import type { AppId } from "@schemavaults/app-definitions";
import {
  DEVICE_AUTHORIZATION_DEFAULT_INTERVAL_SECONDS,
  DEVICE_AUTHORIZATION_EXPIRES_IN_SECONDS,
  generateUserCode,
} from "@schemavaults/auth-common";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import isUniqueViolation from "@/lib/auth-db/is-unique-violation";
import hashToken from "@/lib/auth-db/users/hash-token";
import deleteExpiredDeviceAuthorizations from "./delete-expired-device-authorizations";

export interface CreateDeviceAuthorizationOptions {
  client_app_id: AppId;
  /** The requested scope, wire-format validated by the caller; null when none. */
  requested_scope: string | null;
  /** The request's RFC 8707 `resource`; null when none. */
  resource: string | null;
}

export interface CreatedDeviceAuthorization {
  device_authorization_id: string;
  /** The device's secret handle on the request (only its hash is stored). */
  device_code: string;
  /** The normalized user code (only its hash is stored). */
  user_code: string;
  /** Unix epoch ms. */
  expires_at: number;
  interval_seconds: number;
}

/** A new user code collides with a pending one about once in 10^10 tries. */
const MAX_USER_CODE_ATTEMPTS = 5;

const DEVICE_CODE_BYTES = 32;

function generateDeviceCode(): string {
  const bytes: Uint8Array = crypto.getRandomValues(new Uint8Array(DEVICE_CODE_BYTES));
  return Buffer.from(bytes).toString("base64url");
}

/**
 * Stores a new device authorization request (RFC 8628 §3.1) and returns its
 * codes: a 256-bit device code and a fresh user code no other pending request
 * holds. Both are stored as SHA-256 hashes only. Rows that expired over an
 * hour ago are deleted on the way.
 */
export async function createDeviceAuthorization(
  db: Kysely<AuthDatabase>,
  { client_app_id, requested_scope, resource }: CreateDeviceAuthorizationOptions,
): Promise<CreatedDeviceAuthorization> {
  const now: number = Date.now();
  await deleteExpiredDeviceAuthorizations(db, now);

  const device_code: string = generateDeviceCode();
  const device_code_hash: string = await hashToken(device_code);
  const expires_at: number = now + DEVICE_AUTHORIZATION_EXPIRES_IN_SECONDS * 1000;
  const interval_seconds: number = DEVICE_AUTHORIZATION_DEFAULT_INTERVAL_SECONDS;

  for (let attempt = 1; ; attempt++) {
    const user_code: string = generateUserCode();
    try {
      const row = await db
        .insertInto("device_authorizations")
        .values({
          device_code_hash,
          user_code_hash: await hashToken(user_code),
          client_app_id,
          requested_scope,
          resource,
          status: "pending",
          interval_seconds,
          created_at: now,
          expires_at,
        })
        .returning("device_authorization_id")
        .executeTakeFirstOrThrow();
      return {
        device_authorization_id: row.device_authorization_id,
        device_code,
        user_code,
        expires_at,
        interval_seconds,
      };
    } catch (e: unknown) {
      if (!isUniqueViolation(e) || attempt >= MAX_USER_CODE_ATTEMPTS) {
        throw e;
      }
    }
  }
}

export default createDeviceAuthorization;
