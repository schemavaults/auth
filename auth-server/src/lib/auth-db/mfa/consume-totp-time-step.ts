import "server-only";

import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import isValidUuid from "@/lib/is-valid-uuid";

// Records `time_step` as the last accepted TOTP time step of the user's
// factor, but only if it is later than the step already stored. Returns
// true if it was recorded. Returns false if the factor already accepted
// this step or a later one (a replayed code), or if the user has no such
// TOTP factor.
//
// The compare-and-set is one UPDATE, so two requests racing with the same
// code cannot both succeed: Postgres re-checks the WHERE clause against
// the row the first request committed, and the second request updates
// nothing.
export async function consumeTotpTimeStep(
  db: Kysely<AuthDatabase>,
  args: { uid: string; factor_id: string; time_step: number },
): Promise<boolean> {
  if (!isValidUuid(args.uid) || !isValidUuid(args.factor_id)) {
    return false;
  }
  const { time_step } = args;
  if (!Number.isSafeInteger(time_step) || time_step < 0) {
    throw new TypeError(
      "Cannot consume TOTP time step: 'time_step' must be a non-negative integer",
    );
  }

  const result = await db
    .updateTable("user_mfa_factors")
    .set({ last_used_totp_step: time_step })
    .where("uid", "=", args.uid)
    .where("factor_id", "=", args.factor_id)
    .where("factor_type", "=", "totp")
    .where((eb) =>
      eb.or([
        eb("last_used_totp_step", "is", null),
        eb("last_used_totp_step", "<", time_step),
      ]),
    )
    .executeTakeFirst();
  return Number(result.numUpdatedRows) > 0;
}
