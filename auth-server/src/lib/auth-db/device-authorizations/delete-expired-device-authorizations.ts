import "server-only";
import type { Kysely, Transaction } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import { EXPIRED_DEVICE_AUTHORIZATION_RETENTION_MS } from "./shared";

/**
 * Deletes the device authorizations that expired more than an hour before
 * `now` (until then a late poll still gets `expired_token` rather than
 * `invalid_grant`). Returns how many rows went.
 */
export async function deleteExpiredDeviceAuthorizations(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
  now: number = Date.now(),
): Promise<number> {
  const result = await db
    .deleteFrom("device_authorizations")
    .where("expires_at", "<", now - EXPIRED_DEVICE_AUTHORIZATION_RETENTION_MS)
    .executeTakeFirst();
  return Number(result.numDeletedRows ?? 0);
}

export default deleteExpiredDeviceAuthorizations;
