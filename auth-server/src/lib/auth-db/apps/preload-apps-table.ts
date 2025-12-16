import type { UserData } from "@schemavaults/auth-common";
import type { PreloadedAppsTableDataWithDomainRefs } from "@schemavaults/auth-ui";
import type { SchemaVaultsAppRegistry } from "./app-registry";
import type {
  AuthorizedAppDeclaration,
  AuthorizedAppsRegistry,
} from "./authorized-apps-registry";
import type {
  AppId,
  ListAppsQueryType,
  SchemaVaultsApp,
  SchemaVaultsAppDomainRef,
} from "@schemavaults/app-definitions";
import { getDefinitionForAuthorizedDeclaration } from "./get-app-from-authorized-declaration";

export interface QueryAppsInputOptions {
  list_apps_query_type: ListAppsQueryType;
  user: UserData;
  appsRegistry: SchemaVaultsAppRegistry;
  authorizedAppsRegistry: AuthorizedAppsRegistry;
}

async function loadDomainsForApps(
  apps: SchemaVaultsApp[],
  appsRegistry: SchemaVaultsAppRegistry,
): Promise<Record<AppId, readonly SchemaVaultsAppDomainRef[]>> {
  const uniqueAppIds: readonly AppId[] = [
    ...new Set<AppId>(apps.map((app) => app.app_id)).values(),
  ];

  const domains: Record<string, readonly SchemaVaultsAppDomainRef[]> = {};
  const domains_by_unique_app_id = await Promise.all(
    uniqueAppIds.map(
      async (app_id: AppId): Promise<readonly SchemaVaultsAppDomainRef[]> => {
        const domainsForAppPromise: Promise<
          readonly SchemaVaultsAppDomainRef[]
        > = appsRegistry.getAppDomains(app_id);
        return await domainsForAppPromise;
      },
    ),
  );
  for (const [index, app_id] of uniqueAppIds.entries()) {
    const domains_for_app: readonly SchemaVaultsAppDomainRef[] =
      domains_by_unique_app_id[index] ?? [];
    if (!Array.isArray(domains_for_app)) {
      throw new Error(
        "Expected to have resolved an array of app domains-- but did not produce an array!",
      );
    }
    domains[app_id] = domains_for_app;
  }

  return domains satisfies Record<AppId, readonly SchemaVaultsAppDomainRef[]>;
}

async function returnAppsWithDomains(
  apps: SchemaVaultsApp[],
  appsRegistry: SchemaVaultsAppRegistry,
): Promise<PreloadedAppsTableDataWithDomainRefs> {
  return {
    apps,
    domains: await loadDomainsForApps(apps, appsRegistry),
  };
}

async function preloadAllApps(
  appsRegistry: SchemaVaultsAppRegistry,
  userData: UserData,
) {
  let all_apps: SchemaVaultsApp[];
  try {
    all_apps = await appsRegistry.listApps("all", userData);
  } catch (e: unknown) {
    console.error("Failed to list all apps:", e);
    throw new Error("Failed to list all apps");
  }
  return all_apps;
}

async function preloadPublicApps(
  appsRegistry: SchemaVaultsAppRegistry,
  userData: UserData,
) {
  let public_apps: SchemaVaultsApp[];
  try {
    public_apps = await appsRegistry.listApps("public", userData);
  } catch (e: unknown) {
    console.error("Failed to list public apps:", e);
    throw new Error("Failed to list public apps");
  }
  return public_apps;
}

async function preloadAuthorizedApps(
  appsRegistry: SchemaVaultsAppRegistry,
  authorizedAppsRegistry: AuthorizedAppsRegistry,
  userData: UserData,
): Promise<SchemaVaultsApp[]> {
  const user_authorized_apps: AuthorizedAppDeclaration[] =
    await authorizedAppsRegistry.listAuthorizedAppsForUser(userData.uid);

  if (user_authorized_apps.length === 0) {
    return [];
  }

  let authorized_apps_details: SchemaVaultsApp[];
  try {
    const loadAppDefinitionsForAuthorizedAppsPromises: Promise<SchemaVaultsApp>[] =
      user_authorized_apps.map(async function loadDefForApp(
        authorized_app: AuthorizedAppDeclaration,
      ): Promise<SchemaVaultsApp> {
        return await getDefinitionForAuthorizedDeclaration(
          authorized_app,
          appsRegistry,
        );
      });

    authorized_apps_details = await Promise.all(
      loadAppDefinitionsForAuthorizedAppsPromises,
    );
  } catch (e: unknown) {
    console.error(
      "Failed to load full app definitions for apps marked as authorized: ",
      e,
    );
    throw new Error(
      "Failed to load full app definitions for apps marked as authorized",
    );
  }

  return authorized_apps_details;
}

export async function preloadAppsTable(
  opts: QueryAppsInputOptions,
): Promise<PreloadedAppsTableDataWithDomainRefs> {
  const userData: UserData = opts.user;

  try {
    switch (opts.list_apps_query_type) {
      case "all":
        if (typeof userData.admin !== "boolean" || !userData.admin) {
          throw new Error("You must be an admin to list all SchemaVaults apps");
        }

        return await returnAppsWithDomains(
          await preloadAllApps(opts.appsRegistry, userData),
          opts.appsRegistry,
        );

      case "public":
        return await returnAppsWithDomains(
          await preloadPublicApps(opts.appsRegistry, userData),
          opts.appsRegistry,
        );

      case "authorized":
        return await returnAppsWithDomains(
          await preloadAuthorizedApps(
            opts.appsRegistry,
            opts.authorizedAppsRegistry,
            userData,
          ),
          opts.appsRegistry,
        );

      default:
        throw new Error("Unsupported apps query type");
    }
  } catch (e: unknown) {
    console.error("Failed to list SchemaVaults apps: ", e);
    throw new Error("Failed to list SchemaVaults apps");
  }
}
