import type { OrganizationID } from "@schemavaults/auth-common";

export interface UserOrganizationMembership {
  organization_id: OrganizationID;
  organization_name: string;
  role: string;
  created_at: number;
}

export default async function loadUserOrganizationRolesFromAuthServer(
  auth_server_url: string,
  access_token: string,
): Promise<readonly UserOrganizationMembership[]> {
  const response = await fetch(`${auth_server_url}/api/me/organizations`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${access_token}`,
    },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to load user organization roles from auth server (status: ${response.status})`,
    );
  }

  const body: unknown = await response.json();
  if (
    typeof body !== "object" ||
    !body ||
    !("success" in body) ||
    !body.success
  ) {
    throw new Error(
      "Received failure response when loading user organization roles from auth server",
    );
  }

  if (
    !("data" in body) ||
    typeof body.data !== "object" ||
    !body.data ||
    !("memberships" in body.data) ||
    !Array.isArray(body.data.memberships)
  ) {
    throw new Error(
      "Failed to extract 'memberships' array from auth server response",
    );
  }

  const memberships: UserOrganizationMembership[] = [];
  for (const entry of body.data.memberships) {
    if (
      typeof entry === "object" &&
      entry &&
      typeof entry.organization_id === "string" &&
      typeof entry.role === "string"
    ) {
      memberships.push({
        organization_id: entry.organization_id as OrganizationID,
        organization_name:
          typeof entry.organization_name === "string"
            ? entry.organization_name
            : "",
        role: entry.role,
        created_at: typeof entry.created_at === "number" ? entry.created_at : 0,
      });
    }
  }

  return memberships;
}
