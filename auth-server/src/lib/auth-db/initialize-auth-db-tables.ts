import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "./auth-database-types";
import {
  SchemaVaultsApiServerRegistry,
  SchemaVaultsAppToApiPermissionsRegistry,
} from "./apis";
import { AuthorizedAppsRegistry, SchemaVaultsAppRegistry } from "./apps";
import { UserRegistry } from "./users";
import { OrganizationsRegistry } from "./organizations";
import { AuthServerJwtKeysStore } from "./jwt_keys";

export async function initializeAuthDbTables(
  db: Kysely<AuthDatabase>,
): Promise<void> {
  const appRegistry = new SchemaVaultsAppRegistry(db);
  const apiServerRegistry = new SchemaVaultsApiServerRegistry(db);
  const appsAndApisSetupPromise: Promise<[void, void]> = Promise.all([
    appRegistry.performSetupTasks(),
    apiServerRegistry.performSetupTasks(),
  ]);

  const userRegistry = new UserRegistry(db);
  const setupUserRegistryPromise: Promise<void> =
    userRegistry.performSetupTasks();

  // can create tables that don't depend on each other at the same time

  // depends on apps and apis
  await appsAndApisSetupPromise;
  const appsToApisPermissionsRegistry =
    new SchemaVaultsAppToApiPermissionsRegistry(db);
  const a2aPermsPromise = appsToApisPermissionsRegistry.performSetupTasks();

  // authorized apps depends on users and apps tables
  await setupUserRegistryPromise;
  await appsAndApisSetupPromise;
  const authorizedAppsRegistry = new AuthorizedAppsRegistry(db);

  const authdAppsPromise = authorizedAppsRegistry.performSetupTasks();

  // organizations depends on users
  await setupUserRegistryPromise;
  const orgRegistry = new OrganizationsRegistry(db);
  const setupOrgsRegistryPromise = orgRegistry.performSetupTasks();

  await Promise.all([
    a2aPermsPromise,
    authdAppsPromise,
    setupOrgsRegistryPromise,
  ]);

  const jwtKeysRegistry = new AuthServerJwtKeysStore(db);
  await jwtKeysRegistry.performSetupTasks();
}
