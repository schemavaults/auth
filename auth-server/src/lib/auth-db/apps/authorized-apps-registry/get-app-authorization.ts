import "server-only";
import { appIdSchema, HARDCODED_CORE_SCHEMAVAULTS_APPS_MAP, isHardcodedAppId } from "@schemavaults/app-definitions";
import { type AuthorizedAppDeclaration, authorizedAppDeclarationSchema } from "./authorized-app-declaration-schema";
import isValidUuid from "@/lib/is-valid-uuid";
import type { Kysely, Transaction } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";

export async function getAppAuthorization(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
  uid: string,
  app_id: string
): Promise<AuthorizedAppDeclaration | null> {
  if (isHardcodedAppId(app_id) && HARDCODED_CORE_SCHEMAVAULTS_APPS_MAP.has(app_id)) {
    const hardcoded_app = HARDCODED_CORE_SCHEMAVAULTS_APPS_MAP.get(app_id);
    if (!hardcoded_app)
      throw new Error("Matching hardcoded app for 'app_id' has falsy value");
    return {
      uid,
      user_app_authorization_id: crypto.randomUUID(),
      app_id,
      authorized_at: Date.now() - 1,
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
