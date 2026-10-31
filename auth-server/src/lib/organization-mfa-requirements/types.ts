import type { OrganizationID, OrganizationMembershipRoleType } from "@schemavaults/auth-common";
import type { OrganizationMfaComplianceStatus, OrganizationMfaGracePeriodReason } from "./policy";

/**
 * Client-safe shapes of the organization MFA requirement operations
 * (`OrganizationMfaRequirement` / `MyOrganizationMfaRequirement` in
 * `@/lib/api/domain-schemas/organization-mfa-requirements`), shared with the
 * organization page's requirement card and the dashboard banner.
 */

export interface OrganizationMemberWithoutMfaView {
  uid: string;
  email: string;
  role: OrganizationMembershipRoleType;
  membership_created_at: number;
  status: OrganizationMfaComplianceStatus;
  grace_period_reason: OrganizationMfaGracePeriodReason | null;
  grace_period_ends_at: number | null;
  notified_at: number | null;
}

export interface OrganizationMfaRequirementView {
  organization_id: OrganizationID;
  required: boolean;
  grace_period_days: number | null;
  required_since: number | null;
  updated_at: number | null;
  caller_has_mfa: boolean;
  /** Only for organization owners and platform administrators. */
  members_without_mfa: readonly OrganizationMemberWithoutMfaView[] | null;
}

export interface MyOrganizationMfaRequirementView {
  organization_id: OrganizationID;
  organization_name: string;
  grace_period_days: number;
  required_since: number;
  status: "compliant" | OrganizationMfaComplianceStatus;
  grace_period_reason: OrganizationMfaGracePeriodReason | null;
  grace_period_ends_at: number | null;
}
