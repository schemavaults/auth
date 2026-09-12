import "server-only";

import type { Kysely } from "@schemavaults/dbh";
import type { SchemaVaultsApp } from "@schemavaults/app-definitions";
import type { UserData } from "@schemavaults/auth-common";
import type { AuthDatabase } from "./auth-db/auth-database-types";
import { canUserManageResource } from "./ownership/resource-access";

/**
 * Whether a user may manage a client application's security-sensitive
 * configuration (domains, callback URLs, client secret): global admins,
 * owners/admins of the app's owner organization, or — for user-owned apps —
 * the owning user.
 */
export async function canUserManageApp(
  db: Kysely<AuthDatabase>,
  user: UserData,
  app: SchemaVaultsApp,
): Promise<boolean> {
  return await canUserManageResource(db, user, app);
}

export default canUserManageApp;
