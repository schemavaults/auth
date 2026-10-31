import type { ISchemaVaultsAuthClientAdapter } from "@/types/ISchemaVaultsAuthClientAdapter";
import type { SchemaVaultsAppCreationRequest } from "@schemavaults/app-definitions";
import { schemaVaultsAppCreationRequestSchema } from "@schemavaults/app-definitions";

export interface ICreateClientApplicationOpts {
  adapter: ISchemaVaultsAuthClientAdapter;
  auth_server_uri: string;
  /**
   * The app definition, optionally with the `initial_domains` and
   * `initial_callback_urls` the auth server registers in the same
   * transaction as the app.
   */
  app_definition: SchemaVaultsAppCreationRequest;
}

export async function createClientApplication({
  adapter,
  auth_server_uri,
  app_definition,
}: ICreateClientApplicationOpts): Promise<void> {
  await schemaVaultsAppCreationRequestSchema.parseAsync(app_definition);

  const response = await adapter.fetch(`${auth_server_uri}/api/apps`, {
    method: "POST",
    body: JSON.stringify(app_definition),
    credentials: "include",
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message =
      body &&
      typeof body === "object" &&
      "message" in body &&
      typeof (body as { message: unknown }).message === "string"
        ? (body as { message: string }).message
        : `Failed to create client application: ${response.status}`;
    throw new Error(message);
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
