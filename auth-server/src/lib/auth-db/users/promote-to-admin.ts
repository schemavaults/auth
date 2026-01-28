import "server-only";
import type { Kysely, Transaction } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import isValidUuid from "@/lib/is-valid-uuid";

export async function promoteToAdmin(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
  uid: string,
  debug: boolean = false
): Promise<void> {
  if (!isValidUuid(uid)) {
    throw new Error("Invalid user UUID to promote to admin!");
  }

  if (debug) {
    console.log(`[promoteToAdmin] promoteToAdmin(uid = "${uid}")`);
  }

  try {
    await db.transaction().execute(async (trx) => {
      const setUserToAdminUpdateQuery = trx
        .updateTable("users")
        .set({ admin: true })
        .where("uid", "=", uid);

      const updateResult = await setUserToAdminUpdateQuery.executeTakeFirst();
      if (!updateResult || typeof updateResult !== "object") {
        throw new Error("Expected 'updateResult' to be an object!");
      }
      const numRowsUpdated: number = Number(updateResult.numUpdatedRows);
      if (numRowsUpdated !== 1) {
        throw new Error(
          `Expected exactly one row to have been modified by superadmin promotion operation, but '${numRowsUpdated}' rows were updated!"`,
        );
      }
    });
  } catch (e: unknown) {
    console.error(`Failed to promote user '${uid}' to superuser/admin: `, e);
    throw new Error(`Failed to promote user ${uid} to superuser/admin!`);
  }

  if (debug) {
    console.log(
      `[promoteToAdmin] promoteToAdmin(uid = "${uid}") = Success!`,
    );
  }
}

export default promoteToAdmin;
