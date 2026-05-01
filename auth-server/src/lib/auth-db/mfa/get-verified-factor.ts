import "server-only";

import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import type { UserMfaFactorRow } from "./user-mfa-factors-table";
import { decryptSecret } from "@/lib/mfa/kek";

export interface VerifiedFactor {
  row: UserMfaFactorRow;
  secret: string;
}

export async function getVerifiedFactor(
  db: Kysely<AuthDatabase>,
  uid: string,
): Promise<VerifiedFactor | null> {
  const row = await db
    .selectFrom("user_mfa_factors")
    .selectAll()
    .where("uid", "=", uid)
    .where("verified", "=", true)
    .limit(1)
    .executeTakeFirst();
  if (!row) return null;
  const secret = decryptSecret(row.secret_ciphertext, row.kek_version);
  return { row, secret };
}
