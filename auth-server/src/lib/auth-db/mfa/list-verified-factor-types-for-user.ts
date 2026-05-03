import "server-only";

import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import {
  mfaFactorTypeSchema,
  type MfaFactorType,
} from "@schemavaults/auth-common";

export async function listVerifiedFactorTypesForUser(
  db: Kysely<AuthDatabase>,
  uid: string,
): Promise<MfaFactorType[]> {
  const rows = await db
    .selectFrom("user_mfa_factors")
    .select("factor_type")
    .where("uid", "=", uid)
    .where("verified", "=", true)
    .execute();

  const seen = new Set<MfaFactorType>();
  for (const row of rows) {
    const parsed = mfaFactorTypeSchema.safeParse(row.factor_type);
    if (!parsed.success) {
      console.warn(
        `[listVerifiedFactorTypesForUser] skipping unknown factor_type: ${String(row.factor_type)}`,
      );
      continue;
    }
    seen.add(parsed.data);
  }
  return [...seen];
}
