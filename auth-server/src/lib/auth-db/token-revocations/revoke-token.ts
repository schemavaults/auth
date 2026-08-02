import "server-only";
import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import type {
  NewTokenRevocationRow,
  TokenRevocationReason,
} from "./token-revocations-table";
import isValidUuid from "@/lib/is-valid-uuid";

export async function revokeToken(
  db: Kysely<AuthDatabase>,
  jti: string,
  uid: string,
  expires_at: number,
  reason?: TokenRevocationReason,
): Promise<void> {
  if (!isValidUuid(jti)) {
    throw new TypeError("Invalid jti: expected a valid UUID");
  }
  if (!isValidUuid(uid)) {
    throw new TypeError("Invalid uid: expected a valid UUID");
  }
  if (typeof expires_at !== "number" || !Number.isFinite(expires_at) || expires_at <= 0) {
    throw new TypeError("Invalid expires_at: expected a positive finite number");
  }

  const revoked_at = Date.now();
  await db
    .insertInto("token_revocations")
    .values({
      jti,
      uid,
      expires_at,
      revoked_at,
      reason: reason ?? null,
    } satisfies NewTokenRevocationRow)
    // A jti can only be revoked once; a re-revocation (e.g. a grace-window
    // replay rotating the same token again) keeps the original row, so
    // revoked_at — and with it the reuse grace window — never extends.
    .onConflict((oc) => oc.column("jti").doNothing())
    .execute();
}
