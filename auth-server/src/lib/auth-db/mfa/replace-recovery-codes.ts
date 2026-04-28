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
  await db.transaction().execute(async (tx) => {
    await tx
      .deleteFrom("user_mfa_recovery_codes")
      .where("uid", "=", args.uid)
      .execute();
    if (rows.length > 0) {
      await tx.insertInto("user_mfa_recovery_codes").values(rows).execute();
    }
  });
}
