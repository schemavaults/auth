import "server-only";

import { z } from "zod";
import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import type { UserWebauthnCredentialRow } from "./user-webauthn-credentials-table";

const uuidSchema = z.string().uuid();

function coerceRow(
  row: UserWebauthnCredentialRow,
): UserWebauthnCredentialRow {
  // Postgres returns BIGINT/COUNTER columns as strings; coerce to number.
  return {
    ...row,
    counter: Number(row.counter),
    created_at: Number(row.created_at),
  };
}

// Returns the passkey credential for a factor scoped to the user, regardless
// of whether the factor row is verified yet. Use the verified-only variant
// during login.
export async function getWebauthnCredentialByFactorId(
  db: Kysely<AuthDatabase>,
  args: { uid: string; factor_id: string },
): Promise<UserWebauthnCredentialRow | null> {
  const uid = uuidSchema.parse(args.uid);
  const factor_id = uuidSchema.parse(args.factor_id);
  const row = await db
    .selectFrom("user_webauthn_credentials")
    .selectAll()
    .where("uid", "=", uid)
    .where("factor_id", "=", factor_id)
    .executeTakeFirst();
  return row ? coerceRow(row) : null;
}

// Returns the passkey credential only when its companion factor row is
// verified. Used when validating a login assertion so an in-progress
// enrollment can't be used to satisfy the second-factor gate.
export async function getVerifiedWebauthnCredentialByFactorId(
  db: Kysely<AuthDatabase>,
  args: { uid: string; factor_id: string },
): Promise<UserWebauthnCredentialRow | null> {
  const uid = uuidSchema.parse(args.uid);
  const factor_id = uuidSchema.parse(args.factor_id);
  const row = await db
    .selectFrom("user_webauthn_credentials")
    .innerJoin(
      "user_mfa_factors",
      "user_mfa_factors.factor_id",
      "user_webauthn_credentials.factor_id",
    )
    .selectAll("user_webauthn_credentials")
    .where("user_webauthn_credentials.uid", "=", uid)
    .where("user_webauthn_credentials.factor_id", "=", factor_id)
    .where("user_mfa_factors.verified", "=", true)
    .executeTakeFirst();
  return row ? coerceRow(row) : null;
}

// Resolves a verified passkey credential by its (base64url) credential id —
// the `id` an authenticator returns in an assertion. Used to verify an
// assertion against the exact credential that produced it, since a login
// allowCredentials list may include several of the user's passkeys and the
// user can sign with any of them.
export async function getVerifiedWebauthnCredentialByCredentialId(
  db: Kysely<AuthDatabase>,
  args: { uid: string; credential_id: string },
): Promise<UserWebauthnCredentialRow | null> {
  const uid = uuidSchema.parse(args.uid);
  if (typeof args.credential_id !== "string" || args.credential_id.length === 0) {
    return null;
  }
  const row = await db
    .selectFrom("user_webauthn_credentials")
    .innerJoin(
      "user_mfa_factors",
      "user_mfa_factors.factor_id",
      "user_webauthn_credentials.factor_id",
    )
    .selectAll("user_webauthn_credentials")
    .where("user_webauthn_credentials.uid", "=", uid)
    .where("user_webauthn_credentials.credential_id", "=", args.credential_id)
    .where("user_mfa_factors.verified", "=", true)
    .executeTakeFirst();
  return row ? coerceRow(row) : null;
}
