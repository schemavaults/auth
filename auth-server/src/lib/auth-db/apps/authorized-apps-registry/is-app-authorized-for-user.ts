import "server-only";
import { SCHEMAVAULTS_AUTH_APP_DEFINITION } from "@schemavaults/app-definitions";
import getAppAuthorization from "./get-app-authorization";
import type { Kysely, Transaction } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";

export async function isAppAuthorizedForUser(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
  uid: string,
  app_id: string,
  debug: boolean = false
): Promise<boolean> {
  if (app_id === SCHEMAVAULTS_AUTH_APP_DEFINITION.app_id) {
    return true;
  }

  try {
    const appAuthorization = await getAppAuthorization(db, uid, app_id);
    if (!appAuthorization) return false;
    if (debug) {
      console.log(
        `[AuthorizedAppsRegistry] User with ID "${uid}" has authorized application with ID "${app_id}"`,
      );
    }
    return true;
  } catch (e: unknown) {
    console.error(
      "[AuthorizedAppsRegistry] Failed to check if app is authorized for user: ",
      e,
    );
    throw new Error(
      "Failed to find authorization record for specified app id and user id",
    );
  }
}

export default isAppAuthorizedForUser;
