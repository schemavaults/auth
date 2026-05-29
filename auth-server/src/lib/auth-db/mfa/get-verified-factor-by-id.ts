import "server-only";

import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import type { UserMfaFactorRow } from "./user-mfa-factors-table";
import { decryptSecret } from "@/lib/mfa/kek";

export interface VerifiedFactor {
  row: UserMfaFactorRow;
  secret: string;
}

export async function getVerifiedFactorById(
  db: Kysely<AuthDatabase>,
  args: { uid: string; factor_id: string },
): Promise<VerifiedFactor | null> {
  const row = await db
    .selectFrom("user_mfa_factors")
    .selectAll()
    .where("uid", "=", args.uid)
    .where("factor_id", "=", args.factor_id)
    .where("verified", "=", true)
    .executeTakeFirst();
  if (!row) return null;
  // Only TOTP factors carry a symmetric secret. A passkey (webauthn) factor
  // has null secret material here and cannot be verified via this path.
  if (row.secret_ciphertext === null || row.kek_version === null) return null;
  const secret = decryptSecret(row.secret_ciphertext, row.kek_version);
  return { row, secret };
}
