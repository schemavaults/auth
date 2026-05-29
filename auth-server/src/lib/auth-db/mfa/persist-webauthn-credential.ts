import "server-only";

import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";

// Inserts the verified credential material for a passkey factor. Called from
// the WebAuthn verify-enrollment handler after @simplewebauthn confirms the
// registration response, alongside flipping the factor row to verified. The
// factor_id must already exist as an unverified 'webauthn' factor row.
export async function persistWebauthnCredential(
  db: Kysely<AuthDatabase>,
  args: {
    factor_id: string;
    uid: string;
    credential_id: string;
    public_key: string;
    counter: number;
    transports: string | null;
    aaguid: string | null;
    device_type: string | null;
    backed_up: boolean | null;
    label: string | null;
  },
): Promise<void> {
  await db
    .insertInto("user_webauthn_credentials")
    .values({
      factor_id: args.factor_id,
      uid: args.uid,
      credential_id: args.credential_id,
      public_key: args.public_key,
      counter: args.counter,
      transports: args.transports,
      aaguid: args.aaguid,
      device_type: args.device_type,
      backed_up: args.backed_up,
      label: args.label,
      created_at: Date.now(),
    })
    .execute();
}
