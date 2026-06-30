import "server-only";
import isValidUuid from "@/lib/is-valid-uuid";
import { AuthorizedAppDeclaration, authorizedAppDeclarationSchema } from "./authorized-app-declaration-schema";
import type { Kysely, Transaction } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import { SCHEMAVAULTS_AUTH_APP_ID } from "@schemavaults/app-definitions";

export async function listAuthorizedAppsForUser(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
  uid: string,
  debug: boolean = false
): Promise<AuthorizedAppDeclaration[]> {
  if (debug) {
    console.log(
      "[AuthorizedAppsRegistry] Attempting to list authorized apps for user: ",
      uid,
    );
  }

  if (typeof uid !== "string")
    throw new Error("Expected user ID to be a string");

  if (!isValidUuid(uid)) {
    throw new Error("Received invalid user ID");
  }

  let rows: unknown[];
  try {
    const authorizedAppsForUser = await db
      .selectFrom("authorized_apps")
      .where("uid", "=", uid)
      .limit(50)
      .selectAll()
      .execute();
    if (debug) {
      console.log(
        "[AuthorizedAppsRegistry] Received rows from DB: ",
        authorizedAppsForUser,
      );
    }
    rows = authorizedAppsForUser;
  } catch (e: unknown) {
    console.error("Query to get authorized apps failed: ", e);
    throw new Error("Failed to query for user's authorized apps by uid");
  }

  try {
    const parsed = await authorizedAppDeclarationSchema
      .array()
      .safeParseAsync(
        rows.map((row) => {
          if (typeof row !== "object" || !row)
            throw new Error("Expected each row to be an object");
          if (!Object.hasOwn(row, "authorized_at")) {
            throw new Error(
              "Expected each query row to have an 'authorized_at' property",
            );
          }
          const authorized_at = Number.parseInt(
            (row as { authorized_at: string }).authorized_at,
          );
          if (isNaN(authorized_at))
            throw new Error(
              "Failed to parse authentication time for app in authorized apps registry",
            );
          return {
            ...row,
            authorized_at,
          };
        }),
      );
    if (!parsed.success) throw parsed.error;
    const authorized_apps: readonly AuthorizedAppDeclaration[] = parsed.data;

    // Query authorized hardcoded apps from the separate table
    let authorized_hardcoded_apps: AuthorizedAppDeclaration[] = [];
    try {
      const hardcodedRows = await db
        .selectFrom("authorized_hardcoded_apps")
        .where("uid", "=", uid)
        .limit(50)
        .selectAll()
        .execute();
      authorized_hardcoded_apps = hardcodedRows.map((row) => ({
        app_id: row.app_id,
        authorized_at: Number.parseInt(String(row.authorized_at)),
        uid: row.uid,
        user_app_authorization_id: row.user_hardcoded_app_authorization_id,
      }));
    } catch (e: unknown) {
      console.error("Failed to query authorized hardcoded apps: ", e);
    }

    // The auth app is always authorized (fake authorization)
    const auth_app_fake_authorization: AuthorizedAppDeclaration = {
      app_id: SCHEMAVAULTS_AUTH_APP_ID,
      authorized_at: Date.now(),
      uid,
      user_app_authorization_id: crypto.randomUUID(),
    };

    return [
      ...authorized_apps,
      ...authorized_hardcoded_apps,
      auth_app_fake_authorization,
    ] as const satisfies AuthorizedAppDeclaration[];
  } catch (e: unknown) {
    console.error(e);
    throw new Error("Failed to parse list of authorized apps from database");
  }
}

export default listAuthorizedAppsForUser;
