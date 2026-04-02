import { createJwksAccessProofToken } from "@schemavaults/jwt";
import {
  type ApiServerId,
  apiServerIdSchema,
} from "@schemavaults/app-definitions";
import type { OrganizationID } from "@schemavaults/auth-common";
import { organizationIdSchema } from "@schemavaults/auth-common";

/**
 * Check if a user is a member of an organization by querying the auth server.
 *
 * This function is intended for use by resource servers that need to verify
 * organization membership. It authenticates to the auth server using a
 * JWKS access key token (the same mechanism used for JWKS retrieval).
 *
 * @param auth_server_url - The base URL of the auth server
 * @param api_server_id - The API server ID of the calling resource server
 * @param jwks_access_private_key - The JWKS access private key for signing assertions
 * @param uid - The user ID to check membership for
 * @param organization_id - The organization to check membership in
 * @returns false if not a member, or the role name string (e.g. "owner", "member") if they are
 */
export async function isUserInOrganization(
  auth_server_url: string,
  api_server_id: ApiServerId,
  jwks_access_private_key: CryptoKey,
  uid: string,
  organization_id: OrganizationID,
): Promise<false | string> {
  if (!apiServerIdSchema.safeParse(api_server_id).success) {
    throw new TypeError("Invalid API server ID!");
  }
  if (!organizationIdSchema.safeParse(organization_id).success) {
    throw new TypeError("Invalid organization ID!");
  }
  if (!uid || typeof uid !== "string") {
    throw new TypeError("Invalid user ID!");
  }

  const assertion = await createJwksAccessProofToken({
    api_server_id,
    private_key: jwks_access_private_key,
  });

  const url = `${auth_server_url}/api/resource-server/organizations/${encodeURIComponent(organization_id)}/members/${encodeURIComponent(uid)}/role`;

  const response = await fetch(url, {
    method: "GET",
    headers: new Headers({
      Authorization: `Bearer ${assertion}`,
      "X-Api-Server-Id": api_server_id,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Failed to check organization membership from auth server (status: ${response.status})`,
    );
  }

  const body: unknown = await response.json();
  if (
    typeof body !== "object" ||
    !body ||
    !("success" in body) ||
    !body.success ||
    !("data" in body) ||
    typeof body.data !== "object" ||
    !body.data
  ) {
    throw new Error(
      "Received unexpected response when checking organization membership",
    );
  }

  const data = body.data as { role: string | null };
  if (typeof data.role === "string") {
    return data.role;
  }

  return false;
}

export default isUserInOrganization;
