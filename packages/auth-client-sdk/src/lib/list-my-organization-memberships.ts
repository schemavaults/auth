import type { ISchemaVaultsAuthClientAdapter } from "@/types/ISchemaVaultsAuthClientAdapter";
import {
  organizationMembershipRoleDetailsSchema,
  type OrganizationMembershipRoleDetails,
} from "@schemavaults/auth-common";
import { z } from "zod";

export interface IListMyOrganizationMembershipsOpts {
  adapter: ISchemaVaultsAuthClientAdapter;
  auth_server_uri: string;
}

const listMyOrganizationMembershipsResponseSchema = z
  .object({
    success: z.literal(true),
    message: z.string(),
    data: z
      .object({
        memberships: z.array(organizationMembershipRoleDetailsSchema),
      })
      .required({ memberships: true })
      .strict(),
  })
  .required({ success: true, message: true, data: true })
  .strict();

export async function listMyOrganizationMemberships({
  adapter,
  auth_server_uri,
}: IListMyOrganizationMembershipsOpts): Promise<
  readonly OrganizationMembershipRoleDetails[]
> {
  const response = await adapter.fetch(
    `${auth_server_uri}/api/me/organizations`,
    {
      method: "GET",
      credentials: "include",
    },
  );

  if (!response.ok) {
    throw new Error(
      `Failed to list user organization memberships (response status: ${response.status})`,
    );
  }

  const body: unknown = await response.json();
  const parsed = listMyOrganizationMembershipsResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new Error(
      "Invalid response shape from /api/me/organizations endpoint",
    );
  }

  return parsed.data.data.memberships;
}

export default listMyOrganizationMemberships;
