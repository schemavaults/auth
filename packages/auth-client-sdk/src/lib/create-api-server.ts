import type { ISchemaVaultsAuthClientAdapter } from "@/types/ISchemaVaultsAuthClientAdapter";
import type { SchemaVaultsApiServerDefinition } from "@schemavaults/app-definitions";

export interface ICreateApiServerOpts {
  adapter: ISchemaVaultsAuthClientAdapter;
  api_server_definition: SchemaVaultsApiServerDefinition;
}

export async function createApiServer({
  adapter,
  api_server_definition,
}: ICreateApiServerOpts): Promise<void> {
  const response = await adapter.fetch("/api/apis", {
    method: "POST",
    body: JSON.stringify(api_server_definition),
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error(`Failed to create API server: ${response.status}`);
  }

  const body: unknown = await response.json();
  if (
    typeof body !== "object" ||
    !body ||
    !(body as { success: boolean }).success
  ) {
    throw new Error("API server creation response indicated failure");
  }
}

export default createApiServer;
