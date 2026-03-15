import type { ISchemaVaultsAuthClientAdapter } from "@/types/ISchemaVaultsAuthClientAdapter";
import type { SchemaVaultsApp } from "@schemavaults/app-definitions";
import { schemaVaultsAppDefinitionSchema } from "@schemavaults/app-definitions";

export interface ICreateClientApplicationOpts {
  adapter: ISchemaVaultsAuthClientAdapter;
  auth_server_uri: string;
  app_definition: SchemaVaultsApp;
}

export async function createClientApplication({
  adapter,
  auth_server_uri,
  app_definition,
}: ICreateClientApplicationOpts): Promise<void> {
  await schemaVaultsAppDefinitionSchema.parseAsync(app_definition);

  const response = await adapter.fetch(`${auth_server_uri}/api/apps`, {
    method: "POST",
    body: JSON.stringify(app_definition),
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error(
      `Failed to create client application: ${response.status}`,
    );
  }

  const body: unknown = await response.json();
  if (
    typeof body !== "object" ||
    !body ||
    !(body as { success: boolean }).success
  ) {
    throw new Error("Client application creation response indicated failure");
  }
}

export default createClientApplication;
