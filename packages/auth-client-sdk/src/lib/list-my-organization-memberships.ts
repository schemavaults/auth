import type { ISchemaVaultsAuthClientAdapter } from "@/types/ISchemaVaultsAuthClientAdapter";
import {
  organizationMembershipRoleDetailsSchema,
  type OrganizationMembershipRoleDetails,
} from "@schemavaults/auth-common";
import { z } from "zod";

export interface IListMyOrganizationMembershipsOpts {
  adapter: ISchemaVaultsAuthClientAdapter;
  auth_server_uri: string;
  // Whether this client is running on the auth-server frontend itself.
  is_auth_server: boolean;
  debug?: boolean;
}

/**
 * Thrown by `listMyOrganizationMemberships()` on any client app other than
 * the auth server's own: `/api/me/organizations` takes the auth server
 * session, and the auth server never issues access tokens for its own
 * audience to other apps. A resource server lists its users' memberships
 * server-side instead, with `listUserOrganizations()` (or
 * `ctx.auth.listOrganizationMemberships()` in operation handlers) from
 * `@schemavaults/auth-server-sdk`.
 */
export class MyOrganizationMembershipsUnavailableError extends Error {
  public constructor() {
    super(
      "listMyOrganizationMemberships() is only available on the auth server's own frontend; " +
        "list a user's organization memberships through your resource server instead " +
        "(listUserOrganizations() in @schemavaults/auth-server-sdk)",
    );
    this.name = "MyOrganizationMembershipsUnavailableError";
  }
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
  debug = false,
}: IListMyOrganizationMembershipsOpts): Promise<
  readonly OrganizationMembershipRoleDetails[]
> {
  // Other client apps can never authenticate to this endpoint (see
  // MyOrganizationMembershipsUnavailableError): fail before asking the auth
  // server for a token it will always refuse.
  if (!is_auth_server) {
    throw new MyOrganizationMembershipsUnavailableError();
  }

  const method = "GET" as const;

  // On the auth-server frontend the request is same-origin, so the auth
  // session cookies are sent automatically with credentialed requests.
  // eslint-disable-next-line no-undef
  const requestInit: RequestInit = { method, credentials: "include" };

  const endpoint: string = `${auth_server_uri}/api/me/organizations`;

  if (debug) {
    console.log(
      `[listMyOrganizationMemberships] Sending ${method} request to '${endpoint}'...`,
    );
  }

  const response = await adapter.fetch(endpoint, requestInit);

  if (!response.ok) {
    throw new Error(
      `Failed to list user organization memberships (response status: ${response.status})`,
    );
  }

  const body: unknown = await response.json();
  const parsed =
    await listMyOrganizationMembershipsResponseSchema.safeParseAsync(body);
  if (!parsed.success) {
    throw new Error(
      "Invalid response shape from /api/me/organizations endpoint",
    );
  }

  const membership_roles: readonly OrganizationMembershipRoleDetails[] =
    parsed.data.data.memberships;

  return membership_roles;
}

export default listMyOrganizationMemberships;
