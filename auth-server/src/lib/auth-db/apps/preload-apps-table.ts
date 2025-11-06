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
        let all_apps: SchemaVaultsApp[];
        try {
          all_apps = await opts.appsRegistry.listApps("all", userData);
        } catch (e: unknown) {
          console.error("Failed to list all apps:", e);
          throw new Error("Failed to list all apps");
        }

        return await returnAppsWithDomains(all_apps, opts.appsRegistry);

      case "public":
        const public_apps = await opts.appsRegistry.listApps(
          "public",
          userData,
        );
        return await returnAppsWithDomains(public_apps, opts.appsRegistry);

      case "authorized":
        if (process.env.NODE_ENV === "development") {
          console.log("Attempting to list authorized applications...");
        }

        const user_authorized_apps: AuthorizedAppDeclaration[] =
          await opts.authorizedAppsRegistry.listAuthorizedAppsForUser(
            userData.uid,
          );

        if (process.env.NODE_ENV === "development") {
          console.log(
            "Received list of authorization applications: ",
            user_authorized_apps,
          );
        }

        if (user_authorized_apps.length === 0) {
          return { apps: [], domains: {} };
        }

        let authorized_apps_details: SchemaVaultsApp[];
        try {
          const loadAppDefinitionsForAuthorizedAppsPromises: Promise<SchemaVaultsApp>[] =
            user_authorized_apps.map(async function loadDefForApp(
              authorized_app: AuthorizedAppDeclaration,
            ): Promise<SchemaVaultsApp> {
              return await getDefinitionForAuthorizedDeclaration(
                authorized_app,
                opts.appsRegistry,
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

        return await returnAppsWithDomains(
          authorized_apps_details,
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
