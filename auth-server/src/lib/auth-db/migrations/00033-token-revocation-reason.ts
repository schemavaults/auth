// 00033-token-revocation-reason.ts
// Adds a nullable REASON column to TOKEN_REVOCATIONS. Refresh token
// rotation records the presented token's jti here with reason='rotation';
// rotation revocations are tolerated for a short reuse grace window at the
// refresh grants (absorbing benign concurrent-refresh races), while all
// other revocations (logout, administrative — reason NULL) stay immediate.

import type { Kysely } from "@schemavaults/dbh";
import { sql } from "@/sql";

export async function up(db: Kysely<any>): Promise<void> {
  const addReasonColumn = sql`
    ALTER TABLE TOKEN_REVOCATIONS ADD COLUMN IF NOT EXISTS reason TEXT;
  `;
  await addReasonColumn.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  const dropReasonColumn = sql`
    ALTER TABLE TOKEN_REVOCATIONS DROP COLUMN IF EXISTS reason;
  `;
  await dropReasonColumn.execute(db);
}
