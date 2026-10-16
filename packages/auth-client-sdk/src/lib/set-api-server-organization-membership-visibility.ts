import type { ISchemaVaultsAuthClientAdapter } from "@/types/ISchemaVaultsAuthClientAdapter";
import {
  apiServerIdSchema,
  organizationMembershipVisibilitySchema,
  schemaVaultsApiServerDefinitionSchema,
  type ApiServerId,
  type OrganizationMembershipVisibility,
  type SchemaVaultsApiServerDefinition,
} from "@schemavaults/app-definitions";
import { z } from "zod";

export interface ISetApiServerOrganizationMembershipVisibilityOpts {
  adapter: ISchemaVaultsAuthClientAdapter;
  auth_server_uri: string;
  api_server_id: ApiServerId;
  organization_membership_visibility: OrganizationMembershipVisibility;
}

/**
 * @description `PUT /api/apis/[api_server_id]/organization-membership-visibility`
 * — sets which organizations' memberships the API server may look up on the
 * auth server's resource-server endpoints (`owning_organization`, the
 * default, or `all_organizations`). Platform administrators only. Returns
 * the updated definition.
 */
export async function setApiServerOrganizationMembershipVisibility({
  adapter,
  auth_server_uri,
  api_server_id,
  organization_membership_visibility,
}: ISetApiServerOrganizationMembershipVisibilityOpts): Promise<SchemaVaultsApiServerDefinition> {
  await apiServerIdSchema.parseAsync(api_server_id);
  const visibility: OrganizationMembershipVisibility =
    await organizationMembershipVisibilitySchema.parseAsync(
      organization_membership_visibility,
    );

  const response = await adapter.fetch(
    `${auth_server_uri}/api/apis/${api_server_id}/organization-membership-visibility`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organization_membership_visibility: visibility }),
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
    throw new Error(
      `Failed to set API server organization membership visibility: ${message}`,
    );
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
      "API server organization membership visibility response was malformed",
      { cause: parsed.error },
    );
  }
  return parsed.data.api_server;
}

export default setApiServerOrganizationMembershipVisibility;
