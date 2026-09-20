import "server-only";
import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import type { NewIssuedTokenRow } from "./issued-tokens-table";
import isValidUuid from "@/lib/is-valid-uuid";

function validateRow(row: NewIssuedTokenRow): void {
  if (!isValidUuid(row.jti)) {
    throw new TypeError("Invalid jti: expected a valid UUID");
  }
  if (!isValidUuid(row.uid)) {
    throw new TypeError("Invalid uid: expected a valid UUID");
  }
  if (row.token_type !== "access" && row.token_type !== "refresh") {
    throw new TypeError("Invalid token_type: expected 'access' or 'refresh'");
  }
  if (
    row.grant_type !== "refresh_token" &&
    row.grant_type !== "authorization_code" &&
    row.grant_type !== "client_credentials"
  ) {
    throw new TypeError(
      "Invalid grant_type: expected 'refresh_token', 'authorization_code', or 'client_credentials'",
    );
  }
  if (typeof row.issued_at !== "number" || !Number.isFinite(row.issued_at) || row.issued_at <= 0) {
    throw new TypeError("Invalid issued_at: expected a positive finite number");
  }
  if (typeof row.expires_at !== "number" || !Number.isFinite(row.expires_at) || row.expires_at <= 0) {
    throw new TypeError("Invalid expires_at: expected a positive finite number");
  }
  if (typeof row.client_app_id !== "string" || row.client_app_id.length === 0) {
    throw new TypeError("Invalid client_app_id: expected a non-empty string");
  }
  if (typeof row.audience !== "string" || row.audience.length === 0) {
    throw new TypeError("Invalid audience: expected a non-empty string");
  }
  if (row.refresh_jti !== null && !isValidUuid(row.refresh_jti)) {
    throw new TypeError("Invalid refresh_jti: expected a valid UUID or null");
  }
  if (row.token_type === "refresh" && row.refresh_jti !== null) {
    throw new TypeError("A refresh token row must not carry a refresh_jti");
  }
}

export async function recordIssuedTokens(
  db: Kysely<AuthDatabase>,
  rows: readonly NewIssuedTokenRow[],
): Promise<void> {
  if (rows.length === 0) return;
  for (const row of rows) {
    validateRow(row);
  }
  await db
    .insertInto("issued_tokens")
    .values(rows.map((r) => ({ ...r })))
    .onConflict((oc) => oc.column("jti").doNothing())
    .execute();
}
