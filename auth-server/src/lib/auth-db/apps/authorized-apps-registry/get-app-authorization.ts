import "server-only";
import { appIdSchema, isHardcodedAppId, SCHEMAVAULTS_AUTH_APP_ID } from "@schemavaults/app-definitions";
import { type AuthorizedAppDeclaration, authorizedAppDeclarationSchema } from "./authorized-app-declaration-schema";
import isValidUuid from "@/lib/is-valid-uuid";
import type { Kysely, Transaction } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";

export async function getAppAuthorization(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
  uid: string,
  app_id: string
): Promise<AuthorizedAppDeclaration | null> {
  // The auth app is always authorized
  if (app_id === SCHEMAVAULTS_AUTH_APP_ID) {
    return {
      uid,
      user_app_authorization_id: crypto.randomUUID(),
      app_id,
      authorized_at: Date.now() - 1,
    } satisfies AuthorizedAppDeclaration;
  }

  // Other hardcoded apps require explicit authorization in the authorized_hardcoded_apps table
  if (isHardcodedAppId(app_id)) {
    let rows: unknown[];
    try {
      rows = await db
        .selectFrom("authorized_hardcoded_apps")
        .where("uid", "=", uid)
        .where("app_id", "=", app_id)
        .limit(1)
        .selectAll()
        .execute();
    } catch (e: unknown) {
      console.error(e);
      throw new Error("Failed to query authorized hardcoded apps by uid");
    }
    if (rows.length === 0) return null;
    const row = rows[0] as { user_hardcoded_app_authorization_id: string; app_id: string; uid: string; authorized_at: string };
    return {
      user_app_authorization_id: row.user_hardcoded_app_authorization_id,
      app_id: row.app_id,
      uid: row.uid,
      authorized_at: Number.parseInt(row.authorized_at),
    } satisfies AuthorizedAppDeclaration;
  }

  if (typeof uid !== "string") {
    throw new TypeError("Expected user ID to be a string");
  } else if (!isValidUuid(uid)) {
    throw new TypeError("Received invalid user ID");
  }

  if (typeof app_id !== "string")
    throw new Error("Expected app ID to be a string");
  const parsed_app_id = await appIdSchema.safeParseAsync(app_id);
  if (!parsed_app_id.success) throw new Error("Received invalid app ID");

  let rows: unknown[];
  try {
    rows = await db
      .selectFrom("authorized_apps")
      .where("uid", "=", uid)
      .where("app_id", "=", parsed_app_id.data)
      .limit(1)
      .selectAll()
      .execute();
  } catch (e: unknown) {
    console.error(e);
    throw new Error("Failed to query for user's authorized apps by uid");
  }

  try {
    const parsed = await authorizedAppDeclarationSchema
      .array()
      .safeParseAsync(
        rows.map((row) => {
          if (typeof row !== "object" || !row) {
            throw new Error("Expected each row to be an object");
          }
          if (!Object.hasOwn(row, "authorized_at")) {
            throw new Error(
              "Expected each query row to have an 'authorized_at' property",
            );
          }
          const authorized_at_str = (row as { authorized_at: string })
            .authorized_at;
          const parsed = Number.parseInt(authorized_at_str);
          if (isNaN(parsed))
            throw new Error(
              "Failed to parse 'authorized_at' property for authorized app",
            );
          return {
            ...row,
            authorized_at: parsed,
          };
        }),
      );
    if (!parsed.success) {
      throw parsed.error;
    }
    if (parsed.data.length === 0) {
      return null;
    }
    const appAuthorizationRecord: AuthorizedAppDeclaration | undefined =
      parsed.data[0];
    if (!appAuthorizationRecord) {
      return null;
    }

    return appAuthorizationRecord satisfies AuthorizedAppDeclaration;
  } catch (e: unknown) {
    console.error(e);
    throw new Error("Failed to parse list of authorized apps from database");
  }
}

export default getAppAuthorization;
