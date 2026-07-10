import "server-only";
import { appIdSchema } from "@schemavaults/app-definitions";
import getAuthServerAppId from "@/lib/config/auth-server-app-id";
import type { Kysely, Transaction } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import isValidUuid from "@/lib/is-valid-uuid";

export async function authorizeAppForUser(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
  uid: string,
  app_id: string,
  debug: boolean = false
): Promise<void> {
  if (app_id === getAuthServerAppId()) {
    throw new Error(
      `The auth app "${app_id}" is always authorized and cannot be explicitly authorized`,
    );
  }

  if (typeof uid !== "string") {
    throw new TypeError("Expected user ID to be a string");
  } else if (!isValidUuid(uid)) {
    throw new TypeError("Received invalid user ID");
  }

  if (typeof app_id !== "string") {
    throw new TypeError("Expected app ID to be a string");
  }
  const parsed_app_id = await appIdSchema.safeParseAsync(app_id);
  if (!parsed_app_id.success) {
    throw new TypeError("Received invalid app ID");
  }

  try {
    const now = Date.now();
    await db
      .insertInto("authorized_apps")
      .values({
        app_id: parsed_app_id.data,
        uid,
        authorized_at: now,
      })
      .onConflict((oc) => oc.columns(["app_id", "uid"]).doNothing())
      .execute();
  } catch (e: unknown) {
    console.error(
      "Failed to insert authorized app record into database: ",
      e,
    );
    throw new Error("Failed to insert authorized app record into database!");
  }

  if (debug) {
    console.log(
      `Authorized app ${parsed_app_id.data} for user ${uid} at ${Date.now()}`,
    );
  }
}

export default authorizeAppForUser;
