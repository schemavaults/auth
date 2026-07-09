import "server-only";
import isValidUuid from "@/lib/is-valid-uuid";
import {
  appIdSchema,
  isHardcodedAppId,
  type AppId,
} from "@schemavaults/app-definitions";
import getAuthServerAppId from "@/lib/config/auth-server-app-id";
import type { Kysely, Transaction } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";

export async function removeAppAuthorizationForUser(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
  uid: string,
  app_id: AppId,
  debug: boolean = false
): Promise<void> {
  if (app_id === getAuthServerAppId()) {
    throw new Error(
      `The auth app "${app_id}" is always authorized and cannot be de-authorized`,
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

  if (debug) {
    console.log(`[removeAppAuthorizationForUser] Attempting to delete app '${app_id}' authorization for user '${uid}'!`)
  }

  try {
    if (isHardcodedAppId(app_id)) {
      await db.deleteFrom('authorized_hardcoded_apps')
        .where('uid', '=', uid)
        .where('app_id', '=', app_id)
        .executeTakeFirstOrThrow();
    } else {
      await db.deleteFrom('authorized_apps')
        .where('uid', '=', uid)
        .where('app_id', '=', app_id)
        .executeTakeFirstOrThrow();
    }
  } catch (e: unknown) {
    console.error("[removeAppAuthorizationForUser] Failed to delete app authorization: ", e);
    throw new Error("Failed to delete app authorization!");
  }
}

export default removeAppAuthorizationForUser;
