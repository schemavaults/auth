import type { ISchemaVaultsAuthClientAdapter } from "@/types/ISchemaVaultsAuthClientAdapter";
import {
  type ApiServerId,
  type SchemaVaultsApiServerDomainRef,
  apiServerIdSchema,
  schemaVaultsApiServerDomainRefSchema,
} from "@schemavaults/app-definitions";

export interface IListApiServerDomainsOpts {
  adapter: ISchemaVaultsAuthClientAdapter;
  auth_server_uri: string;
  api_server_id: ApiServerId;
}

export async function listApiServerDomains({
  adapter,
  auth_server_uri,
  api_server_id,
}: IListApiServerDomainsOpts): Promise<SchemaVaultsApiServerDomainRef[]> {
  if (!(await apiServerIdSchema.safeParseAsync(api_server_id)).success) {
    throw new TypeError("Invalid api_server_id");
  }

  const response = await adapter.fetch(
    `${auth_server_uri}/api/apis/${api_server_id}/domains`,
    {
      method: "GET",
      credentials: "include",
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to list API server domains: ${response.status}`);
  }

  const body: unknown = await response.json();
  if (typeof body !== "object" || !body) {
    throw new Error("Invalid response from list API server domains endpoint");
  }

  const result = body as {
    success: boolean;
    list?: unknown[];
    message?: string;
  };
  if (!result.success) {
    throw new Error(result.message ?? "Failed to list API server domains");
  }

  return schemaVaultsApiServerDomainRefSchema.array().parse(result.list);
}

export default listApiServerDomains;
