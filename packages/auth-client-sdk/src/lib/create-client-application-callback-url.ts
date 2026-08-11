import type { ISchemaVaultsAuthClientAdapter } from "@/types/ISchemaVaultsAuthClientAdapter";
import type { SchemaVaultsAppCallbackUrlRef } from "@schemavaults/app-definitions";
import { schemaVaultsAppCallbackUrlRefSchema } from "@schemavaults/app-definitions";

export interface ICreateClientApplicationCallbackUrlOpts {
  adapter: ISchemaVaultsAuthClientAdapter;
  auth_server_uri: string;
  app_callback_url_definition: SchemaVaultsAppCallbackUrlRef;
}

export async function createClientApplicationCallbackUrl({
  adapter,
  auth_server_uri,
  app_callback_url_definition,
}: ICreateClientApplicationCallbackUrlOpts): Promise<void> {
  await schemaVaultsAppCallbackUrlRefSchema.parseAsync(
    app_callback_url_definition,
  );

  const response = await adapter.fetch(
    `${auth_server_uri}/api/apps/${app_callback_url_definition.app_id}/callback-urls`,
    {
      method: "POST",
      body: JSON.stringify(app_callback_url_definition),
      credentials: "include",
    },
  );

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message =
      body && typeof body === "object" && "message" in body
        ? (body as { message: string }).message
        : `Failed to create client application callback URL: ${response.status}`;
    throw new Error(message);
  }

  const body: unknown = await response.json();
  if (
    typeof body !== "object" ||
    !body ||
    !(body as { success: boolean }).success
  ) {
    throw new Error(
      "Client application callback URL creation response indicated failure",
    );
  }
}

export default createClientApplicationCallbackUrl;
