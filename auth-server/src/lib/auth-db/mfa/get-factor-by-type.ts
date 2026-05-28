import "server-only";

import { z } from "zod";
import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import {
  mfaFactorTypeSchema,
  type MfaFactorType,
} from "@schemavaults/auth-common";
import type { UserMfaFactorRow } from "./user-mfa-factors-table";

const uidSchema = z.string().uuid();

// Returns the user's factor of a given type — verified OR an in-progress
// (unverified) enrollment — filtering factor_type in SQL rather than
// scanning every factor in memory. A verified factor wins over a pending
// enrollment; among unverified rows the most recently created one wins.
export async function getFactorByType(
  db: Kysely<AuthDatabase>,
  args: { uid: string; factor_type: MfaFactorType },
): Promise<UserMfaFactorRow | null> {
  // Validate inputs before they reach the query — guards against a bad
  // caller passing an unknown factor type or a non-UUID uid.
  const uid = uidSchema.parse(args.uid);
  const factor_type = mfaFactorTypeSchema.parse(args.factor_type);

  const row = await db
    .selectFrom("user_mfa_factors")
    .selectAll()
    .where("uid", "=", uid)
    .where("factor_type", "=", factor_type)
    .orderBy("verified", "desc")
    .orderBy("created_at", "desc")
    .executeTakeFirst();
  return row ?? null;
}
