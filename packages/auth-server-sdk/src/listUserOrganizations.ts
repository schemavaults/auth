import { createJwksAccessProofToken } from "@schemavaults/jwt";
import {
  type ApiServerId,
  apiServerIdSchema,
} from "@schemavaults/app-definitions";
import {
  organizationMembershipRoleDetailsSchema,
  type OrganizationMembershipRoleDetails,
} from "@schemavaults/auth-common/organizations";
import { z } from "zod";
import isValidUuid from "@/is-valid-uuid";

/** Header the user's access token is forwarded in (the RFC 8693 "subject token"). */
export const SUBJECT_TOKEN_HEADER_NAME = "X-Subject-Token" as const;

export interface IListUserOrganizationsOptions {
  /** Base URL of the auth server. */
  auth_server_url: string;
  /** The calling resource server's API server id. */
  api_server_id: ApiServerId;
  /** The API server's JWKS access private key (signs the single-use assertion). */
  jwks_access_private_key: CryptoKey;
  /** The user to list the memberships of. */
  uid: string;
  /**
   * The user's access token for this API server, exactly as it was
   * presented to the resource server. The auth server only answers for a
   * user who holds an active token for the calling API server.
   */
  subject_token: string;
  /** Override for tests. */
  fetch?: typeof fetch;
}

const listUserOrganizationsResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    uid: z.string(),
    memberships: z.array(organizationMembershipRoleDetailsSchema),
  }),
});

/**
 * Lists a user's organization memberships by asking the auth server
 * (`GET /api/resource-server/users/{uid}/organizations`), for resource
 * servers that show or filter by "my organizations".
 *
 * Authenticates as the API server with a JWKS access assertion and
 * forwards the user's access token in `X-Subject-Token`. The auth server
 * returns only the memberships the API server may see: its owning
 * organization's, or every organization's when a platform administrator
 * granted it the `all_organizations` membership visibility.
 *
 * @throws when the auth server refuses the request (e.g. 403 for a
 * subject token that is not an active token of `uid` for this API server)
 * or answers with an unexpected body.
 */
export async function listUserOrganizations({
  auth_server_url,
  api_server_id,
  jwks_access_private_key,
  uid,
  subject_token,
  fetch: fetchImpl = fetch,
}: IListUserOrganizationsOptions): Promise<
  readonly OrganizationMembershipRoleDetails[]
> {
  if (!apiServerIdSchema.safeParse(api_server_id).success) {
    throw new TypeError("Invalid API server ID!");
  }
  if (!isValidUuid(uid)) {
    throw new TypeError("Invalid user ID!");
  }
  if (typeof subject_token !== "string" || subject_token.length === 0) {
    throw new TypeError("A subject token (the user's access token) is required!");
  }

  const assertion: string = await createJwksAccessProofToken({
    api_server_id,
    auth_server_url,
    private_key: jwks_access_private_key,
  });

  const url = new URL(
    `/api/resource-server/users/${encodeURIComponent(uid)}/organizations`,
    auth_server_url,
  );

  const response = await fetchImpl(url.toString(), {
    method: "GET",
    headers: new Headers({
      Authorization: `Bearer ${assertion}`,
      "X-Api-Server-Id": api_server_id,
      [SUBJECT_TOKEN_HEADER_NAME]: subject_token,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Failed to list organization memberships from auth server (status: ${response.status})`,
    );
  }

  const parsed = listUserOrganizationsResponseSchema.safeParse(
    await response.json(),
  );
  if (!parsed.success || parsed.data.data.uid !== uid) {
    throw new Error(
      "Received unexpected response when listing organization memberships",
    );
  }
  return parsed.data.data.memberships;
}

export default listUserOrganizations;
