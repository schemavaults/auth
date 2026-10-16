import { z } from "zod";

/**
 * Which organizations' memberships an API server may look up on the auth
 * server's resource-server endpoints
 * (`/api/resource-server/organizations/{organization_id}/members/{uid}/role`
 * and `/api/resource-server/users/{uid}/organizations`):
 *
 * - `owning_organization`: only the organization that owns the API server
 *   (for a platform-owned API server, the deployment's owner organization).
 *   The default, and the only option a third-party resource server needs.
 * - `all_organizations`: any organization. Meant for multi-tenant platform
 *   services (e.g. a registry serving every organization) and granted only
 *   by platform administrators. Lookups outside the owning organization are
 *   always bound to a live access token the user issued for the API server.
 */
export const ORGANIZATION_MEMBERSHIP_VISIBILITIES = [
  "owning_organization",
  "all_organizations",
] as const satisfies readonly string[];

export type OrganizationMembershipVisibility =
  (typeof ORGANIZATION_MEMBERSHIP_VISIBILITIES)[number];

export const DEFAULT_ORGANIZATION_MEMBERSHIP_VISIBILITY =
  "owning_organization" as const satisfies OrganizationMembershipVisibility;

export const organizationMembershipVisibilitySchema = z.enum(
  ORGANIZATION_MEMBERSHIP_VISIBILITIES,
);

/**
 * Membership-visibility field of an API server definition. Optional on the
 * wire (older SDK consumers and the hardcoded definitions omit it); absent
 * means {@link DEFAULT_ORGANIZATION_MEMBERSHIP_VISIBILITY}.
 */
export const apiServerOrganizationMembershipVisibilityFieldsShape = {
  /** See {@link ORGANIZATION_MEMBERSHIP_VISIBILITIES}. */
  organization_membership_visibility:
    organizationMembershipVisibilitySchema.optional(),
} as const;

/** The API server's effective visibility (the default when unset). */
export function getOrganizationMembershipVisibility(api_server: {
  organization_membership_visibility?: OrganizationMembershipVisibility | undefined;
}): OrganizationMembershipVisibility {
  return (
    api_server.organization_membership_visibility ??
    DEFAULT_ORGANIZATION_MEMBERSHIP_VISIBILITY
  );
}

/**
 * How an API server may see memberships of `organization_id`:
 *
 * - `"owner"`: the API server belongs to the organization, so it may look
 *   up any user's role there (no user token required).
 * - `"granted"`: the organization is not the API server's, but a platform
 *   administrator granted it `all_organizations`; the lookup must be bound
 *   to the user's access token for the API server.
 * - `false`: the API server may not see the organization's memberships.
 */
export type OrganizationMembershipAccess = "owner" | "granted" | false;

export function getOrganizationMembershipAccess(
  api_server: {
    owner_organization_id?: string | null | undefined;
    organization_membership_visibility?: OrganizationMembershipVisibility | undefined;
  },
  organization_id: string,
): OrganizationMembershipAccess {
  if (
    typeof api_server.owner_organization_id === "string" &&
    api_server.owner_organization_id === organization_id
  ) {
    return "owner";
  }
  if (getOrganizationMembershipVisibility(api_server) === "all_organizations") {
    return "granted";
  }
  return false;
}
