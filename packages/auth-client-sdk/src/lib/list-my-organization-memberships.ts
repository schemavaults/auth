import type { ISchemaVaultsAuthClientAdapter } from "@/types/ISchemaVaultsAuthClientAdapter";
import type { AcquireAccessTokenOptions } from "@/types/acquire-access-token-options";
import {
  organizationMembershipRoleDetailsSchema,
  type AccessToken,
  type OrganizationMembershipRoleDetails,
} from "@schemavaults/auth-common";
import { SCHEMAVAULTS_AUTH_APP_ID } from "@schemavaults/app-definitions";
import { z } from "zod";

export interface IListMyOrganizationMembershipsOpts {
  adapter: ISchemaVaultsAuthClientAdapter;
  auth_server_uri: string;
  // Whether this client is running on the auth-server frontend itself.
  is_auth_server: boolean;
  acquireAccessToken: (opts: AcquireAccessTokenOptions) => Promise<AccessToken>;
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
  is_auth_server,
  acquireAccessToken,
}: IListMyOrganizationMembershipsOpts): Promise<
  readonly OrganizationMembershipRoleDetails[]
> {
  // eslint-disable-next-line no-undef
  const requestInit: RequestInit = { method: "GET" };

  if (is_auth_server) {
    // On the auth-server frontend the request is same-origin, so the auth
    // session cookies are sent automatically with credentialed requests.
    requestInit.credentials = "include";
  } else {
    // On an external app the auth-server's cookies are not available
    // cross-origin; authenticate with a 'schemavaults-auth' access token.
    const accessToken: AccessToken = await acquireAccessToken({
      audience: SCHEMAVAULTS_AUTH_APP_ID,
    });
    requestInit.headers = {
      Authorization: `Bearer ${accessToken.token}`,
    };
  }

  const response = await adapter.fetch(
    `${auth_server_uri}/api/me/organizations`,
    requestInit,
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
