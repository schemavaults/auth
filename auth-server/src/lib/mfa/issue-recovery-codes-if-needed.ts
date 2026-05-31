import "server-only";

import { sql } from "@/sql";
import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import isValidUuid from "@/lib/is-valid-uuid";
import { generateRecoveryCodes } from "./generate-recovery-codes";
import { countRecoveryCodesRemaining } from "@/lib/auth-db/mfa/count-recovery-codes-remaining";
import { replaceRecoveryCodes } from "@/lib/auth-db/mfa/replace-recovery-codes";

// Recovery codes are an account-wide MFA fallback, issued once when the user
// gains their *first* verified factor. Enrolling an additional factor (e.g. a
// passkey on top of existing TOTP, or vice-versa) must NOT regenerate them —
// doing so would silently invalidate the codes the user already saved.
//
// Shared by both the TOTP and WebAuthn verify-enrollment handlers. Issues a
// fresh set only when the user currently has zero remaining recovery codes;
// otherwise leaves the existing set intact.
//
// The "count, then maybe replace" is a check-then-act that two enrollments
// completing at once could both pass (each observing zero codes), causing a
// double issue where the second replace clobbers the first caller's codes —
// leaving that caller believing it surfaced valid codes that no longer exist.
// Run it inside a single transaction guarded by a per-uid advisory lock so
// concurrent issuance for the same user is serialized: the first transaction
// holds the lock through commit, and the second then observes the codes the
// first wrote and returns recovery_codes_issued=false.
export async function issueRecoveryCodesIfNeeded(
  db: Kysely<AuthDatabase>,
  uid: string,
): Promise<{ recovery_codes: string[]; recovery_codes_issued: boolean }> {
  if (!isValidUuid(uid)) {
    throw new TypeError(
      "Cannot issue recovery codes: 'uid' is not a valid UUID",
    );
  }
  return await db.transaction().execute(async (tx) => {
    // Transaction-scoped lock keyed on the uid; released automatically on
    // commit/rollback. hashtextextended() maps the uid text to the bigint
    // key that pg_advisory_xact_lock() expects.
    await sql`SELECT pg_advisory_xact_lock(hashtextextended(${uid}, 0))`.execute(
      tx,
    );
    const remaining = await countRecoveryCodesRemaining(tx, uid);
    if (remaining > 0) {
      return { recovery_codes: [], recovery_codes_issued: false };
    }
    const recovery_codes = generateRecoveryCodes();
    await replaceRecoveryCodes(tx, { uid, codes: recovery_codes });
    return { recovery_codes, recovery_codes_issued: true };
  });
}
