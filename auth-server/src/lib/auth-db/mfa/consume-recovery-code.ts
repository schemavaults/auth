import "server-only";

import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import { hashRecoveryCode } from "@/lib/mfa/hash-recovery-code";

// Marks a recovery code as used for the user and returns true on
// success. Returns false if the code does not exist or has already been
// consumed (caller treats both as authentication failure).
export async function consumeRecoveryCode(
  db: Kysely<AuthDatabase>,
  args: { uid: string; code: string },
): Promise<boolean> {
  const code_hash = hashRecoveryCode(args.code);
  const result = await db
    .updateTable("user_mfa_recovery_codes")
    .set({ used_at: Date.now() })
    .where("uid", "=", args.uid)
    .where("code_hash", "=", code_hash)
    .where("used_at", "is", null)
    .executeTakeFirst();
  return Number(result.numUpdatedRows) > 0;
}
