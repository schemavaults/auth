import "server-only";
import type { Kysely, Transaction } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import { hashToken } from "./hash-token";

export interface ValidPasswordResetToken {
  uid: string;
  token_id: string;
}

export async function validatePasswordResetToken(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
  rawToken: string,
  debug: boolean = false,
): Promise<ValidPasswordResetToken | null> {
  const tokenHash: string = await hashToken(rawToken);

  if (debug) {
    console.log("[validatePasswordResetToken] Looking up token by hash");
  }

  const row = await db
    .selectFrom("password_reset_tokens")
    .where("token_hash", "=", tokenHash)
    .where("used_at", "is", null)
    .select(["token_id", "uid", "expires_at"])
    .executeTakeFirst();

  if (!row) {
    if (debug) {
      console.log("[validatePasswordResetToken] No matching unused token found");
    }
    return null;
  }

  const expiresAt: number = typeof row.expires_at === "number"
    ? row.expires_at
    : parseInt(row.expires_at as string);

  if (expiresAt <= Date.now()) {
    if (debug) {
      console.log("[validatePasswordResetToken] Token has expired");
    }
    return null;
  }

  return { uid: row.uid, token_id: row.token_id };
}

export default validatePasswordResetToken;
