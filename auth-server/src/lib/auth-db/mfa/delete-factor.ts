import "server-only";

import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";

export async function deleteFactor(
  db: Kysely<AuthDatabase>,
  args: { uid: string; factor_id: string },
): Promise<boolean> {
  const result = await db
    .deleteFrom("user_mfa_factors")
    .where("uid", "=", args.uid)
    .where("factor_id", "=", args.factor_id)
    .executeTakeFirst();
  return Number(result.numDeletedRows) > 0;
}
