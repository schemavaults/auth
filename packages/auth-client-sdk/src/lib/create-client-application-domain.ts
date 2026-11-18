import type { ISchemaVaultsAuthClientAdapter } from "@/types/ISchemaVaultsAuthClientAdapter";
import type { SchemaVaultsAppDomainRef } from "@schemavaults/app-definitions";
import { schemaVaultsAppDomainRefSchema } from "@schemavaults/app-definitions";

export interface ICreateClientApplicationDomainOpts {
  adapter: ISchemaVaultsAuthClientAdapter;
  auth_server_uri: string;
  app_domain_definition: SchemaVaultsAppDomainRef;
}

export async function createClientApplicationDomain({
  adapter,
  auth_server_uri,
  app_domain_definition,
}: ICreateClientApplicationDomainOpts): Promise<void> {
  await schemaVaultsAppDomainRefSchema.parseAsync(app_domain_definition);

  const response = await adapter.fetch(
    `${auth_server_uri}/api/apps/${app_domain_definition.app_id}/domains`,
    {
      method: "POST",
      body: JSON.stringify(app_domain_definition),
      credentials: "include",
    },
  );

  if (!response.ok) {
    // Surface the server's explanation (e.g. which conflict a 409 is)
    // rather than only the status code.
    const body: unknown = await response.json().catch(() => null);
    const message: unknown =
      body && typeof body === "object" && "message" in body
        ? (body as { message: unknown }).message
        : undefined;
    throw new Error(
      typeof message === "string" && message.length > 0
        ? message
        : `Failed to create client application domain: ${response.status}`,
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
