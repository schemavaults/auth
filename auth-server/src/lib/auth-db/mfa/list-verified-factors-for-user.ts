import "server-only";

import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import {
  mfaFactorTypeSchema,
  type MfaFactorType,
} from "@schemavaults/auth-common";

export interface VerifiedFactorSummary {
  factor_id: string;
  factor_type: MfaFactorType;
  last_used_at: number | null;
  verified_at: number | null;
}

export async function listVerifiedFactorsForUser(
  db: Kysely<AuthDatabase>,
  uid: string,
): Promise<VerifiedFactorSummary[]> {
  const rows = await db
    .selectFrom("user_mfa_factors")
    .select(["factor_id", "factor_type", "last_used_at", "verified_at"])
    .where("uid", "=", uid)
    .where("verified", "=", true)
    .execute();

  const summaries: VerifiedFactorSummary[] = [];
  for (const row of rows) {
    const parsed = mfaFactorTypeSchema.safeParse(row.factor_type);
    if (!parsed.success) {
      console.warn(
        `[listVerifiedFactorsForUser] skipping unknown factor_type: ${String(row.factor_type)}`,
      );
      continue;
    }
    summaries.push({
      factor_id: row.factor_id,
      factor_type: parsed.data,
      // Postgres returns BIGINT columns as strings; coerce to number.
      last_used_at:
        row.last_used_at == null ? null : Number(row.last_used_at),
      verified_at:
        row.verified_at == null ? null : Number(row.verified_at),
    });
  }

  // Sort by last_used_at DESC NULLS LAST so the most-recently-used factor
  // is the natural default selection in the UI factor picker. Never-used
  // factors fall to the end.
  summaries.sort((a, b) => {
    if (a.last_used_at === b.last_used_at) return 0;
    if (a.last_used_at === null) return 1;
    if (b.last_used_at === null) return -1;
    return b.last_used_at - a.last_used_at;
  });

  return summaries;
}
