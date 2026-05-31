import "server-only";

import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import isValidUuid from "@/lib/is-valid-uuid";

// credential_id and public_key are persisted base64url-encoded (no padding);
// reject anything outside that alphabet before it reaches the DB so a
// malformed value can't poison the UNIQUE credential_id index or render the
// stored public key undecodable at assertion time.
const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;

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
  if (!isValidUuid(args.factor_id)) {
    throw new TypeError(
      "Cannot persist WebAuthn credential: 'factor_id' is not a valid UUID",
    );
  }
  if (!isValidUuid(args.uid)) {
    throw new TypeError(
      "Cannot persist WebAuthn credential: 'uid' is not a valid UUID",
    );
  }
  if (!BASE64URL_RE.test(args.credential_id)) {
    throw new TypeError(
      "Cannot persist WebAuthn credential: 'credential_id' is not base64url-encoded",
    );
  }
  if (!BASE64URL_RE.test(args.public_key)) {
    throw new TypeError(
      "Cannot persist WebAuthn credential: 'public_key' is not base64url-encoded",
    );
  }
  if (!Number.isSafeInteger(args.counter) || args.counter < 0) {
    throw new TypeError(
      "Cannot persist WebAuthn credential: 'counter' must be a non-negative integer",
    );
  }
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
