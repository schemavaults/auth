import { resolveResourceOwnership, type ResourceOwnershipFields } from "@schemavaults/app-definitions";
import type { AssignableOrganizationMembershipRole } from "@schemavaults/auth-common";

/**
 * Whether (and how) an app's service account is a member of the
 * organization that owns the app — the `organization_membership` of
 * `GET /api/apps/{app_id}/service-account` and the app detail page.
 */
export interface ServiceAccountOrganizationMembershipSummary {
  /** Whether the app is organization-owned (only then can its service account join one). */
  available: boolean;
  /** The organization that owns the app, or null. */
  organization_id: string | null;
  /** The service account's role there, or null when it is not a member. */
  role: AssignableOrganizationMembershipRole | null;
}

/** The organization that owns the app, or null when it is not organization-owned. */
export function owningOrganizationIdOfApp(app: ResourceOwnershipFields): string | null {
  const ownership = resolveResourceOwnership(app);
  return ownership.owner_type === "organization" ? ownership.owner_organization_id : null;
}

/**
 * Summarize the stored service account organization role (migration
 * 00043) of an app. The role only applies while the app is
 * organization-owned, matching the virtual membership that
 * `listUserOrganizationMemberships` reports.
 */
export function summarizeServiceAccountOrganizationMembership(
  app: ResourceOwnershipFields,
  stored: { role: AssignableOrganizationMembershipRole } | null,
): ServiceAccountOrganizationMembershipSummary {
  const organization_id: string | null = owningOrganizationIdOfApp(app);
  return {
    available: organization_id !== null,
    organization_id,
    role: organization_id !== null && stored ? stored.role : null,
  };
}
