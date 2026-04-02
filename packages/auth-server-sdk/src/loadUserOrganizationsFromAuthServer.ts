import type { OrganizationID } from "@schemavaults/auth-common";
import loadUserOrganizationRolesFromAuthServer from "./loadUserOrganizationRolesFromAuthServer";

export default async function loadUserOrganizationsFromAuthServer(
  auth_server_url: string,
  access_token: string,
): Promise<readonly OrganizationID[]> {
  const memberships = await loadUserOrganizationRolesFromAuthServer(
    auth_server_url,
    access_token,
  );
  const organization_ids = new Set<OrganizationID>(
    memberships.map((m) => m.organization_id),
  );
  return [...organization_ids.values()];
}
