import "server-only";
import type { Kysely, Transaction } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import isValidUuid from "@/lib/is-valid-uuid";
import { DISABLED_USER_TOKENS_VALID_AFTER } from "./is-token-iat-revoked";

export class UserNotFoundError extends Error {
  public constructor(uid: string) {
    super(`User not found with uid ${uid}`);
    this.name = "UserNotFoundError";
  }
}

/**
 * Disables or re-enables an account.
 *
 * Disabling also revokes every session and token of the account: the
 * route guards read `disabled` from the token claims, not the live row, so
 * flipping the column alone would leave a stolen refresh-token cookie
 * working until it expires. In the same transaction, the account's
 * `tokens_valid_after` watermark is pinned to
 * `DISABLED_USER_TOKENS_VALID_AFTER`, which revokes every token it has,
 * whatever its `iat`, for as long as it stays disabled.
 *
 * Re-enabling moves a pinned watermark down to the current time, so tokens
 * minted before the account was re-enabled stay revoked and the user has to
 * log in again. Re-enabling an account that is not disabled leaves its
 * watermark (and so its sessions) alone.
 *
 * Callers must drop the route guards' cached watermark afterwards
 * (`invalidateUserTokensValidAfterCache`) so this applies immediately
 * instead of after the cache TTL.
 */
export async function setUserDisabled(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
  uid: string,
  disabled: boolean,
  debug: boolean = false,
): Promise<void> {
  if (!isValidUuid(uid)) {
    throw new Error("Invalid user UUID to set disabled state!");
  }

  if (debug) {
    console.log(
      `[setUserDisabled] setUserDisabled(uid = "${uid}", disabled = ${disabled})`,
    );
  }

  try {
    await db.transaction().execute(async (trx) => {
      const updateResult = await trx
        .updateTable("users")
        .set(
          disabled
            ? { disabled, tokens_valid_after: DISABLED_USER_TOKENS_VALID_AFTER }
            : { disabled },
        )
        .where("uid", "=", uid)
        .executeTakeFirst();

      if (!updateResult || typeof updateResult !== "object") {
        throw new Error("Expected 'updateResult' to be an object!");
      }
      const numRowsUpdated: number = Number(updateResult.numUpdatedRows);
      if (numRowsUpdated === 0) {
        throw new UserNotFoundError(uid);
      }
      if (numRowsUpdated !== 1) {
        throw new Error(
          `Expected exactly one row to have been modified by setUserDisabled, but '${numRowsUpdated}' rows were updated!`,
        );
      }

      if (!disabled) {
        // Unpin the watermark. Strict less-than keeps a token minted in the
        // same second as (right after) the re-enable valid.
        await trx
          .updateTable("users")
          .set({ tokens_valid_after: Math.floor(Date.now() / 1000) })
          .where("uid", "=", uid)
          .where("tokens_valid_after", ">=", DISABLED_USER_TOKENS_VALID_AFTER)
          .executeTakeFirst();
      }
    });
  } catch (e: unknown) {
    if (e instanceof UserNotFoundError) {
      throw e;
    }
    console.error(
      `Failed to set disabled=${disabled} for user '${uid}': `,
      e,
    );
    throw new Error(
      `Failed to set disabled=${disabled} for user '${uid}'!`,
    );
  }

  if (debug) {
    console.log(
      `[setUserDisabled] setUserDisabled(uid = "${uid}", disabled = ${disabled}) = Success!`,
    );
  }
}

export default setUserDisabled;
