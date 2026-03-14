import type { ISchemaVaultsAuthClientAdapter } from "@/types/ISchemaVaultsAuthClientAdapter";
import type { SchemaVaultsAppDomainRef } from "@schemavaults/app-definitions";

export interface ICreateClientApplicationDomainOpts {
  adapter: ISchemaVaultsAuthClientAdapter;
  app_domain_definition: SchemaVaultsAppDomainRef;
}

export async function createClientApplicationDomain({
  adapter,
  app_domain_definition,
}: ICreateClientApplicationDomainOpts): Promise<void> {
  const response = await adapter.fetch(
    `/api/apps/${app_domain_definition.app_id}/domains`,
    {
      method: "POST",
      body: JSON.stringify(app_domain_definition),
      credentials: "include",
    },
  );

  if (!response.ok) {
    throw new Error(
      `Failed to create client application domain: ${response.status}`,
    );
  }

  const body: unknown = await response.json();
  if (
    typeof body !== "object" ||
    !body ||
    !(body as { success: boolean }).success
  ) {
    throw new Error(
      "Client application domain creation response indicated failure",
    );
  }
}

export default createClientApplicationDomain;
