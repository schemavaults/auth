import "server-only";
import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import type { NewTokenRevocationRow } from "./token-revocations-table";

export async function revokeToken(
  db: Kysely<AuthDatabase>,
  jti: string,
  uid: string,
  expires_at: number,
): Promise<void> {
  const revoked_at = Date.now();
  await db
    .insertInto("token_revocations")
    .values({ jti, uid, expires_at, revoked_at } satisfies NewTokenRevocationRow)
    .onConflict((oc) => oc.column("jti").doNothing())
    .execute();
}
