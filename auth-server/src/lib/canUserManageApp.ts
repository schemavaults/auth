import "server-only";

import type { Kysely } from "@schemavaults/dbh";
import type { SchemaVaultsApp } from "@schemavaults/app-definitions";
import type { OrganizationID, UserData } from "@schemavaults/auth-common";
import type { AuthDatabase } from "./auth-db/auth-database-types";
import isUserInOrganization from "./isUserInOrganization";

/**
 * Whether a user may manage a client application's security-sensitive
 * configuration (domains, callback URLs, client secret): global admins,
 * or owners/admins of the app's owner organization.
 */
export async function canUserManageApp(
  db: Kysely<AuthDatabase>,
  user: UserData,
  app: SchemaVaultsApp,
): Promise<boolean> {
  if (user.admin) {
    return true;
  }
  if (!app.owner_organization_id) {
    return false;
  }
  const role = await isUserInOrganization(
    db,
    user,
    app.owner_organization_id as OrganizationID,
  );
  return role === "owner" || role === "admin";
}

export default canUserManageApp;
