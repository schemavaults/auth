// 00027-clear-stale-hardcoded-app-authorizations.ts
//
// feature/whitelabel reduced the hardcoded apps to only the auth server
// itself, so rows in authorized_hardcoded_apps for formerly-hardcoded apps
// (e.g. "schemavaults-web") no longer resolve to any app definition and
// crashed the /account authorized-apps listing. The auth server app is
// always implicitly authorized and never written to this table, so every
// remaining row is either dangling or redundant — clear them all.

import type { Kysely } from "@schemavaults/dbh";
import { sql } from "@/sql";

export async function up(db: Kysely<any>): Promise<void> {
  await sql`DELETE FROM authorized_hardcoded_apps;`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  // Lossy: the deleted authorization rows cannot be restored. They were
  // unusable dead data (no hardcoded app definitions exist for them), so
  // reverting is intentionally a no-op.
}
