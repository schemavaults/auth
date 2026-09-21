import type { ISchemaVaultsAuthClientAdapter } from "@/types/ISchemaVaultsAuthClientAdapter";
import {
  apiServerIdSchema,
  resourceUrlMatchModeSchema,
  schemaVaultsApiServerDefinitionSchema,
  type ApiServerId,
  type ResourceUrlMatchMode,
  type SchemaVaultsApiServerDefinition,
} from "@schemavaults/app-definitions";
import { z } from "zod";

/**
 * The dynamic-client policy of an API server: whether clients registered
 * through RFC 7591 dynamic client registration may request tokens for it
 * without an explicit connection, and how an RFC 8707 `resource` URL is
 * matched against its registered domains.
 */
export interface ApiServerDynamicClientPolicy {
  allow_dynamic_clients: boolean;
  resource_url_match_mode: ResourceUrlMatchMode;
}

export const apiServerDynamicClientPolicyUpdateSchema = z
  .object({
    allow_dynamic_clients: z.boolean().optional(),
    resource_url_match_mode: resourceUrlMatchModeSchema.optional(),
  })
  .strict()
  .refine(
    (update) =>
      update.allow_dynamic_clients !== undefined ||
      update.resource_url_match_mode !== undefined,
    "At least one policy field must be provided",
  );

export type ApiServerDynamicClientPolicyUpdate = z.infer<
  typeof apiServerDynamicClientPolicyUpdateSchema
>;

export interface IUpdateApiServerDynamicClientPolicyOpts {
  adapter: ISchemaVaultsAuthClientAdapter;
  auth_server_uri: string;
  api_server_id: ApiServerId;
  update: ApiServerDynamicClientPolicyUpdate;
}

/**
 * @description `PATCH /api/apis/[api_server_id]` — updates the API server's
 * dynamic-client policy. Requires management access to the API server
 * (organization owners/admins, the owning user, or global admins).
 * Returns the updated definition.
 */
export async function updateApiServerDynamicClientPolicy({
  adapter,
  auth_server_uri,
  api_server_id,
  update,
}: IUpdateApiServerDynamicClientPolicyOpts): Promise<SchemaVaultsApiServerDefinition> {
  await apiServerIdSchema.parseAsync(api_server_id);
  const body = await apiServerDynamicClientPolicyUpdateSchema.parseAsync(update);

  const response = await adapter.fetch(
    `${auth_server_uri}/api/apis/${api_server_id}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      credentials: "include",
    },
  );

  const parsed_body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      typeof parsed_body === "object" &&
      parsed_body !== null &&
      typeof (parsed_body as { message?: unknown }).message === "string"
        ? (parsed_body as { message: string }).message
        : `${response.status}`;
    throw new Error(`Failed to update API server dynamic-client policy: ${message}`);
  }

  const parsed = z
    .object({
      success: z.literal(true),
      api_server: schemaVaultsApiServerDefinitionSchema,
    })
    .loose()
    .safeParse(parsed_body);
  if (!parsed.success) {
    throw new Error(
      "API server dynamic-client policy update response was malformed",
      { cause: parsed.error },
    );
  }
  return parsed.data.api_server;
}

export default updateApiServerDynamicClientPolicy;
