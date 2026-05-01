import "server-only";
import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import isValidUuid from "@/lib/is-valid-uuid";
import type { IssuedTokenRow, IssuedTokenType } from "./issued-tokens-table";

export interface ListIssuedTokensForUserOptions {
  token_type?: IssuedTokenType;
  limit?: number;
}

export async function listIssuedTokensForUser(
  db: Kysely<AuthDatabase>,
  uid: string,
  options: ListIssuedTokensForUserOptions = {},
): Promise<readonly IssuedTokenRow[]> {
  if (!isValidUuid(uid)) {
    throw new TypeError("Invalid uid: expected a valid UUID");
  }

  const limit = options.limit ?? 200;

  let query = db
    .selectFrom("issued_tokens")
    .selectAll()
    .where("uid", "=", uid);

  if (options.token_type) {
    query = query.where("token_type", "=", options.token_type);
  }

  const rows = await query
    .orderBy("issued_at", "desc")
    .limit(limit)
    .execute();

  return rows.map((row) => ({
    ...row,
    issued_at: toNumber(row.issued_at),
    expires_at: toNumber(row.expires_at),
  }));
}

function toNumber(value: unknown): number {
  return typeof value === "string" ? parseInt(value, 10) : Number(value);
}
