import type { OrganizationID, UserData } from "@schemavaults/auth-common";
import type { PreloadedApiServersTableData } from "@schemavaults/auth-ui";
import type { SchemaVaultsApiServerRegistry } from "./api-server-registry";
import type { ListApiServersQueryType } from "@schemavaults/app-definitions";

export interface QueryApiServersInputOptions {
  list_api_servers_query_type: ListApiServersQueryType;
  user: UserData;
  apiServerRegistry: SchemaVaultsApiServerRegistry;
  organization_id?: OrganizationID;
}

export async function preloadApiServersTable(
  opts: QueryApiServersInputOptions,
): Promise<PreloadedApiServersTableData> {
  const userData: UserData = opts.user;

  try {
    switch (opts.list_api_servers_query_type) {
      case "org": {
        if (!opts.organization_id) {
          throw new Error("organization_id is required for 'org' query type");
        }
        const org_api_servers = await opts.apiServerRegistry.listOrganizationApiServers(
          opts.organization_id,
          userData,
        );
        return { api_servers: org_api_servers };
      }

      default:
        throw new Error("Unsupported API servers query type");
    }
  } catch (e: unknown) {
    console.error("Failed to list SchemaVaults API servers: ", e);
    throw new Error("Failed to list SchemaVaults API servers");
  }
}
