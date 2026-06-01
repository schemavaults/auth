import "server-only";

import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import isValidUuid from "@/lib/is-valid-uuid";

// Persists the new WebAuthn signature counter after a successful assertion.
// @simplewebauthn returns the authenticator's post-assertion counter; storing
// it lets the next assertion detect a regressed (cloned) authenticator.
export async function updateWebauthnCounter(
  db: Kysely<AuthDatabase>,
  args: { factor_id: string; counter: number },
): Promise<void> {
  if (!isValidUuid(args.factor_id)) {
    throw new TypeError(
      "Cannot update WebAuthn counter: 'factor_id' is not a valid UUID",
    );
  }
  if (!Number.isSafeInteger(args.counter) || args.counter < 0) {
    throw new TypeError(
      "Cannot update WebAuthn counter: 'counter' must be a non-negative integer",
    );
  }
  await db
    .updateTable("user_webauthn_credentials")
    .set({ counter: args.counter })
    .where("factor_id", "=", args.factor_id)
    .execute();
}
