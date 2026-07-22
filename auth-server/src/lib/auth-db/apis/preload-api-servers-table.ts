import type { OrganizationID, UserData } from "@schemavaults/auth-common";
import type { PreloadedApiServersTableDataWithDomainRefs } from "@schemavaults/auth-ui";
import type { SchemaVaultsApiServerRegistry } from "./api-server-registry";
import type {
  ApiServerId,
  ListApiServersQueryType,
  SchemaVaultsApiServerDefinition,
  SchemaVaultsApiServerDomainRef,
} from "@schemavaults/app-definitions";

export interface QueryApiServersInputOptions {
  list_api_servers_query_type: ListApiServersQueryType;
  user: UserData;
  apiServerRegistry: SchemaVaultsApiServerRegistry;
  organization_id?: OrganizationID;
}

async function loadDomainsForApiServers(
  api_servers: readonly SchemaVaultsApiServerDefinition[],
  apiServerRegistry: SchemaVaultsApiServerRegistry,
): Promise<Record<ApiServerId, readonly SchemaVaultsApiServerDomainRef[]>> {
  const uniqueApiServerIds: readonly ApiServerId[] = [
    ...new Set<ApiServerId>(
      api_servers.map((api_server) => api_server.api_server_id),
    ).values(),
  ];

  const domains: Record<string, readonly SchemaVaultsApiServerDomainRef[]> = {};
  const domains_by_unique_api_server_id = await Promise.all(
    uniqueApiServerIds.map(
      async (
        api_server_id: ApiServerId,
      ): Promise<readonly SchemaVaultsApiServerDomainRef[]> => {
        return await apiServerRegistry.getApiServerDomains(api_server_id);
      },
    ),
  );
  for (const [index, api_server_id] of uniqueApiServerIds.entries()) {
    const domains_for_api_server: readonly SchemaVaultsApiServerDomainRef[] =
      domains_by_unique_api_server_id[index] ?? [];
    if (!Array.isArray(domains_for_api_server)) {
      throw new Error(
        "Expected to have resolved an array of API server domains-- but did not produce an array!",
      );
    }
    domains[api_server_id] = domains_for_api_server;
  }

  return domains satisfies Record<
    ApiServerId,
    readonly SchemaVaultsApiServerDomainRef[]
  >;
}

async function returnApiServersWithDomains(
  api_servers: readonly SchemaVaultsApiServerDefinition[],
  apiServerRegistry: SchemaVaultsApiServerRegistry,
): Promise<PreloadedApiServersTableDataWithDomainRefs> {
  return {
    api_servers,
    domains: await loadDomainsForApiServers(api_servers, apiServerRegistry),
  };
}

export async function preloadApiServersTable(
  opts: QueryApiServersInputOptions,
): Promise<PreloadedApiServersTableDataWithDomainRefs> {
  const userData: UserData = opts.user;

  try {
    switch (opts.list_api_servers_query_type) {
      case "all": {
        if (typeof userData.admin !== "boolean" || !userData.admin) {
          throw new Error("You must be an admin to list all API servers");
        }
        const all_api_servers = await opts.apiServerRegistry.listAllApiServers();
        return await returnApiServersWithDomains(
          all_api_servers,
          opts.apiServerRegistry,
        );
      }

      case "org": {
        if (!opts.organization_id) {
          throw new Error("organization_id is required for 'org' query type");
        }
        const org_api_servers = await opts.apiServerRegistry.listOrganizationApiServers(
          opts.organization_id,
          userData,
        );
        return await returnApiServersWithDomains(
          org_api_servers,
          opts.apiServerRegistry,
        );
      }

      default:
        throw new Error("Unsupported API servers query type");
    }
  } catch (e: unknown) {
    console.error("Failed to list API servers: ", e);
    throw new Error("Failed to list API servers");
  }
}
