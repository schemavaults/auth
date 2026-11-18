import type { ISchemaVaultsAuthClientAdapter } from "@/types/ISchemaVaultsAuthClientAdapter";
import type { SchemaVaultsApiServerDomainRef } from "@schemavaults/app-definitions";
import { schemaVaultsApiServerDomainRefSchema } from "@schemavaults/app-definitions";

export interface ICreateApiServerDomainOpts {
  adapter: ISchemaVaultsAuthClientAdapter;
  auth_server_uri: string;
  api_server_domain_definition: SchemaVaultsApiServerDomainRef;
}

export async function createApiServerDomain({
  adapter,
  auth_server_uri,
  api_server_domain_definition,
}: ICreateApiServerDomainOpts): Promise<void> {
  await schemaVaultsApiServerDomainRefSchema.parseAsync(api_server_domain_definition);

  const response = await adapter.fetch(
    `${auth_server_uri}/api/apis/${api_server_domain_definition.api_server_id}/domains`,
    {
      method: "POST",
      body: JSON.stringify(api_server_domain_definition),
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
        : `Failed to create API server domain: ${response.status}`,
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
