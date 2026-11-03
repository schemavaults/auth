import type { ISchemaVaultsAuthClientAdapter } from "@/types/ISchemaVaultsAuthClientAdapter";
import {
  apiServerIdSchema,
  schemaVaultsApiServerDefinitionSchema,
  type ApiServerId,
  type SchemaVaultsApiServerDefinition,
} from "@schemavaults/app-definitions";
import { z } from "zod";

export interface ISetApiServerDelegatedTokenPolicyOpts {
  adapter: ISchemaVaultsAuthClientAdapter;
  auth_server_uri: string;
  api_server_id: ApiServerId;
  accept_delegated_tokens: boolean;
}

/**
 * @description `PUT /api/apis/[api_server_id]/delegated-token-policy` — sets
 * whether the API server accepts delegated access tokens, whose RFC 8693
 * actor (`act`) claim names someone acting on behalf of the user (e.g. a
 * client app's agent). Turn it on only once the API server's resource server
 * runs `@schemavaults/auth-server-sdk` 0.39.0+: older versions reject tokens
 * carrying `act`. Requires management access to the API server
 * (organization owners/admins, the owning user, or global admins). Returns
 * the updated definition.
 */
export async function setApiServerDelegatedTokenPolicy({
  adapter,
  auth_server_uri,
  api_server_id,
  accept_delegated_tokens,
}: ISetApiServerDelegatedTokenPolicyOpts): Promise<SchemaVaultsApiServerDefinition> {
  await apiServerIdSchema.parseAsync(api_server_id);
  const accept: boolean = await z.boolean().parseAsync(accept_delegated_tokens);

  const response = await adapter.fetch(
    `${auth_server_uri}/api/apis/${api_server_id}/delegated-token-policy`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accept_delegated_tokens: accept }),
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
    throw new Error(`Failed to set API server delegated-token policy: ${message}`);
  }

  const parsed = z
    .object({
      success: z.literal(true),
      api_server: schemaVaultsApiServerDefinitionSchema,
    })
    .loose()
    .safeParse(parsed_body);
  if (!parsed.success) {
    throw new Error("API server delegated-token policy response was malformed", {
      cause: parsed.error,
    });
  }
  return parsed.data.api_server;
}

export default setApiServerDelegatedTokenPolicy;
