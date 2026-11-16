import "server-only";
import type { Kysely, Transaction } from "@schemavaults/dbh";
import { normalizeUserCode } from "@schemavaults/auth-common";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import hashToken from "@/lib/auth-db/users/hash-token";
import {
  DEVICE_AUTHORIZATION_COLUMNS,
  toDeviceAuthorization,
  type DeviceAuthorization,
} from "./shared";

/**
 * The pending, unexpired device authorization a user code (as the user
 * typed it) names, or null: a malformed code, an unknown one, one already
 * approved, denied or redeemed, or an expired one.
 */
export async function findPendingDeviceAuthorizationByUserCode(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
  user_code_input: string,
  now: number = Date.now(),
): Promise<DeviceAuthorization | null> {
  const user_code: string | null = normalizeUserCode(user_code_input);
  if (user_code === null) {
    return null;
  }
  const row = await db
    .selectFrom("device_authorizations")
    .select(DEVICE_AUTHORIZATION_COLUMNS)
    .where("user_code_hash", "=", await hashToken(user_code))
    .where("status", "=", "pending")
    .where("expires_at", ">", now)
    .executeTakeFirst();
  return row ? toDeviceAuthorization(row) : null;
}

export default findPendingDeviceAuthorizationByUserCode;
