// 00041-disabled-users-revoke-tokens.ts
// Disabling an account used to flip USERS.disabled only. The route guards
// read `disabled` from the token claims, so a disabled account kept every
// live session (refresh-token cookie, access tokens) until those tokens
// expired. setUserDisabled now pins the account's `tokens_valid_after`
// watermark to DISABLED_USER_TOKENS_VALID_AFTER (Number.MAX_SAFE_INTEGER,
// see users/is-token-iat-revoked.ts) for as long as it stays disabled,
// which revokes every token the account holds. This migration applies the
// same pin to accounts that were disabled before the change, so their
// sessions are cut off as soon as it runs.

import type { Kysely } from "@schemavaults/dbh";
import { sql } from "@/sql";

// Keep in sync with DISABLED_USER_TOKENS_VALID_AFTER. Not a timestamp: a
// value past any token's `iat`, meaning "no token is valid". Bound as a
// string ("9007199254740991") for the BIGINT column.
const DISABLED_USER_TOKENS_VALID_AFTER = String(Number.MAX_SAFE_INTEGER);

export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    UPDATE USERS
      SET tokens_valid_after = ${DISABLED_USER_TOKENS_VALID_AFTER}::BIGINT
      WHERE disabled = TRUE
        AND tokens_valid_after < ${DISABLED_USER_TOKENS_VALID_AFTER}::BIGINT;
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  // Code from before this migration never lowers the watermark, so a pinned
  // account would stay locked out of every session even after being
  // re-enabled. Unpin to the current time instead: every token issued
  // before the rollback stays revoked.
  await sql`
    UPDATE USERS
      SET tokens_valid_after = FLOOR(EXTRACT(EPOCH FROM NOW()))::BIGINT
      WHERE tokens_valid_after >= ${DISABLED_USER_TOKENS_VALID_AFTER}::BIGINT;
  `.execute(db);
}
