import type { ISchemaVaultsAuthClientAdapter } from "@/types/ISchemaVaultsAuthClientAdapter";
import type { SchemaVaultsApiServerDomainRef } from "@schemavaults/app-definitions";

export interface ICreateApiServerDomainOpts {
  adapter: ISchemaVaultsAuthClientAdapter;
  api_server_domain_definition: SchemaVaultsApiServerDomainRef;
}

export async function createApiServerDomain({
  adapter,
  api_server_domain_definition,
}: ICreateApiServerDomainOpts): Promise<void> {
  const response = await adapter.fetch(
    `/api/apis/${api_server_domain_definition.api_server_id}/domains`,
    {
      method: "POST",
      body: JSON.stringify(api_server_domain_definition),
      credentials: "include",
    },
  );

  if (!response.ok) {
    throw new Error(
      `Failed to create API server domain: ${response.status}`,
    );
  }

  const body: unknown = await response.json();
  if (
    typeof body !== "object" ||
    !body ||
    !(body as { success: boolean }).success
  ) {
    throw new Error("API server domain creation response indicated failure");
  }
}

export default createApiServerDomain;
