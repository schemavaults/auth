import "server-only";

import { z } from "zod";
import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";

const uidSchema = z.string().uuid();

export interface WebauthnCredentialSummaryRow {
  factor_id: string;
  credential_id: string;
  transports: string | null;
  label: string | null;
  created_at: number;
  last_used_at: number | null;
  verified: boolean;
}

// Lists a user's passkey factors joined with their factor row so callers get
// both the credential material (for building login allowCredentials) and the
// factor's verified state / last_used timestamp (for the settings list).
// Returns verified and unverified rows; callers filter as needed.
export async function listWebauthnCredentialsForUser(
  db: Kysely<AuthDatabase>,
  uid: string,
): Promise<WebauthnCredentialSummaryRow[]> {
  const validatedUid = uidSchema.parse(uid);
  const rows = await db
    .selectFrom("user_webauthn_credentials")
    .innerJoin(
      "user_mfa_factors",
      "user_mfa_factors.factor_id",
      "user_webauthn_credentials.factor_id",
    )
    .select([
      "user_webauthn_credentials.factor_id as factor_id",
      "user_webauthn_credentials.credential_id as credential_id",
      "user_webauthn_credentials.transports as transports",
      "user_webauthn_credentials.label as label",
      "user_webauthn_credentials.created_at as created_at",
      "user_mfa_factors.last_used_at as last_used_at",
      "user_mfa_factors.verified as verified",
    ])
    .where("user_webauthn_credentials.uid", "=", validatedUid)
    .execute();

  const summaries: WebauthnCredentialSummaryRow[] = rows.map((row) => ({
    factor_id: row.factor_id,
    credential_id: row.credential_id,
    transports: row.transports,
    label: row.label,
    // Postgres returns BIGINT columns as strings; coerce to number.
    created_at: Number(row.created_at),
    last_used_at: row.last_used_at == null ? null : Number(row.last_used_at),
    verified: row.verified,
  }));

  // Most-recently-used first, never-used last — matches the factor picker.
  summaries.sort((a, b) => {
    if (a.last_used_at === b.last_used_at) return b.created_at - a.created_at;
    if (a.last_used_at === null) return 1;
    if (b.last_used_at === null) return -1;
    return b.last_used_at - a.last_used_at;
  });

  return summaries;
}
