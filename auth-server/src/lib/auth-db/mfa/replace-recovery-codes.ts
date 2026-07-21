import "server-only";

import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import { hashRecoveryCode } from "@/lib/mfa/hash-recovery-code";

// Atomically replaces all recovery code rows for the user with a fresh
// set of hashed codes. Used at first verify-enrollment and on every
// regenerate.
export async function replaceRecoveryCodes(
  db: Kysely<AuthDatabase>,
  args: { uid: string; codes: string[] },
): Promise<void> {
  const now = Date.now();
  const rows = args.codes.map((code) => ({
    code_id: crypto.randomUUID(),
    uid: args.uid,
    code_hash: hashRecoveryCode(code),
    created_at: now,
    used_at: null,
  }));
  const replaceAll = async (tx: Kysely<AuthDatabase>): Promise<void> => {
    await tx
      .deleteFrom("user_mfa_recovery_codes")
      .where("uid", "=", args.uid)
      .execute();
    if (rows.length > 0) {
      await tx.insertInto("user_mfa_recovery_codes").values(rows).execute();
    }
  };
  // Callers may already be inside a transaction (e.g. the advisory-lock
  // transaction in issueRecoveryCodesIfNeeded); Kysely throws on nested
  // .transaction() calls, so only open one when we're not in one already.
  if (db.isTransaction) {
    await replaceAll(db);
  } else {
    await db.transaction().execute(replaceAll);
  }
}
