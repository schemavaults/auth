import "server-only";
import type { Kysely, Transaction } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import isValidUuid from "@/lib/is-valid-uuid";

/**
 * Bumps the per-user `tokens_valid_after` watermark. The refresh-token
 * grant handler rejects any refresh token whose `iat` claim is strictly
 * less than this value, so calling this with `Math.floor(Date.now() /
 * 1000)` invalidates every refresh token previously issued for the user.
 *
 * `valid_after` is in unix **seconds**, matching the JWT `iat` claim
 * produced by jose's `setIssuedAt`.
 *
 * The UPDATE is guarded by `tokens_valid_after < valid_after` so a clock
 * rewind cannot lower an already-set watermark.
 */
export async function invalidateAllTokensForUser(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
  uid: string,
  valid_after: number,
  debug: boolean = false,
): Promise<void> {
  if (!isValidUuid(uid)) {
    throw new TypeError("Invalid uid: expected a valid UUID");
  }
  if (
    typeof valid_after !== "number" ||
    !Number.isFinite(valid_after) ||
    valid_after <= 0
  ) {
    throw new TypeError(
      "Invalid valid_after: expected a positive finite number",
    );
  }

  const result = await db
    .updateTable("users")
    .set({ tokens_valid_after: valid_after })
    .where("uid", "=", uid)
    .where((eb) =>
      eb.or([
        eb("tokens_valid_after", "is", null),
        eb("tokens_valid_after", "<", valid_after),
      ]),
    )
    .executeTakeFirst();

  if (debug) {
    console.log(
      `[invalidateAllTokensForUser] uid=${uid} valid_after=${valid_after} affected=${result.numUpdatedRows}`,
    );
  }
}

export default invalidateAllTokensForUser;
