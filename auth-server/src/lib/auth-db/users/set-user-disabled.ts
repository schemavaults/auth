import "server-only";
import type { Kysely, Transaction } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import isValidUuid from "@/lib/is-valid-uuid";

export class UserNotFoundError extends Error {
  public constructor(uid: string) {
    super(`User not found with uid ${uid}`);
    this.name = "UserNotFoundError";
  }
}

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
        .set({ disabled })
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
