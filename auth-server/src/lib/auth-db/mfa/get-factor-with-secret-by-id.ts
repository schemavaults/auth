import "server-only";

import { z } from "zod";
import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import type { UserMfaFactorRow } from "./user-mfa-factors-table";
import { decryptSecret } from "@/lib/mfa/kek";

const uuidSchema = z.string().uuid();

export interface FactorWithSecret {
  row: UserMfaFactorRow;
  secret: string;
}

// Returns a factor (verified OR unverified) scoped to the user, with its
// decrypted secret. Use when authorizing an action against a specific
// factor the caller named — e.g. removing a factor by proving a current
// code from that same factor. For the verified-only variant used during
// login, see getVerifiedFactorById.
export async function getFactorWithSecretById(
  db: Kysely<AuthDatabase>,
  args: { uid: string; factor_id: string },
): Promise<FactorWithSecret | null> {
  // Validate inputs before they reach the query.
  const uid = uuidSchema.parse(args.uid);
  const factor_id = uuidSchema.parse(args.factor_id);

  const row = await db
    .selectFrom("user_mfa_factors")
    .selectAll()
    .where("uid", "=", uid)
    .where("factor_id", "=", factor_id)
    .executeTakeFirst();
  if (!row) return null;
  // Only TOTP factors carry a symmetric secret; a passkey factor has none.
  if (row.secret_ciphertext === null || row.kek_version === null) return null;
  const secret = decryptSecret(row.secret_ciphertext, row.kek_version);
  return { row, secret };
}
