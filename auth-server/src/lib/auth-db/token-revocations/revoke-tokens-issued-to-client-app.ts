import "server-only";
import type { Kysely, Transaction } from "@schemavaults/dbh";
import { appIdSchema } from "@schemavaults/app-definitions";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import type { NewTokenRevocationRow } from "./token-revocations-table";
import isValidUuid from "@/lib/is-valid-uuid";

/**
 * Revokes every unexpired token (access and refresh, for every audience)
 * that was issued to `client_app_id` on behalf of `uid`, as tracked in
 * `issued_tokens`. Used when the user revokes their authorization of a
 * client app, so the app's outstanding tokens die with the consent
 * instead of outliving it until they expire. The user's tokens for other
 * client apps are untouched.
 *
 * Issued-token tracking is best-effort (a failed audit insert never
 * blocks issuance), so the refresh grant and token introspection also
 * check `isAppAuthorizedForUser` themselves rather than relying on this.
 *
 * Returns the number of tokens this call revoked.
 */
export async function revokeTokensIssuedToClientApp(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
  uid: string,
  client_app_id: string,
  now: number = Date.now(),
): Promise<number> {
  if (!isValidUuid(uid)) {
    throw new TypeError("Invalid uid: expected a valid UUID");
  }
  if (!appIdSchema.safeParse(client_app_id).success) {
    throw new TypeError("Invalid client_app_id: expected a valid app id");
  }

  // Tokens already revoked (logout, rotation) are skipped, so the count
  // reflects what this call revoked and a repeated call reports 0.
  const issued = await db
    .selectFrom("issued_tokens")
    .leftJoin("token_revocations", "token_revocations.jti", "issued_tokens.jti")
    .select(["issued_tokens.jti", "issued_tokens.expires_at"])
    .where("issued_tokens.uid", "=", uid)
    .where("issued_tokens.client_app_id", "=", client_app_id)
    .where("issued_tokens.expires_at", ">", now)
    .where("token_revocations.jti", "is", null)
    .execute();

  if (issued.length === 0) {
    return 0;
  }

  const rows: NewTokenRevocationRow[] = issued.map((row) => ({
    jti: row.jti,
    uid,
    expires_at:
      typeof row.expires_at === "string"
        ? parseInt(row.expires_at, 10)
        : Number(row.expires_at),
    revoked_at: now,
    // Revoked by the resource owner: immediate, no rotation-reuse grace.
    reason: null,
  }));

  await db
    .insertInto("token_revocations")
    .values(rows)
    .onConflict((oc) => oc.column("jti").doNothing())
    .execute();

  return rows.length;
}

export default revokeTokensIssuedToClientApp;
