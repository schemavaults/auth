import "server-only";

import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";

// Persists the new WebAuthn signature counter after a successful assertion.
// @simplewebauthn returns the authenticator's post-assertion counter; storing
// it lets the next assertion detect a regressed (cloned) authenticator.
export async function updateWebauthnCounter(
  db: Kysely<AuthDatabase>,
  args: { factor_id: string; counter: number },
): Promise<void> {
  await db
    .updateTable("user_webauthn_credentials")
    .set({ counter: args.counter })
    .where("factor_id", "=", args.factor_id)
    .execute();
}
