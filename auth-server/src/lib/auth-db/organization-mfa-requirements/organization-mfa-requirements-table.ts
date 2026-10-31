import type { Generated, Insertable, Selectable, Updateable } from "@schemavaults/dbh";
import type { OrganizationID, OrganizationMembershipRoleType } from "@schemavaults/auth-common";
import type { OrganizationMfaGracePeriodReason } from "@/lib/organization-mfa-requirements/policy";

/**
 * ORGANIZATION_MFA_REQUIREMENTS (migration 00048): a row makes the
 * organization require multi-factor authentication of its members.
 */
export interface OrganizationMfaRequirementsTable {
  organization_id: OrganizationID;
  grace_period_days: number;
  /** When the requirement was turned on (unchanged by later edits). */
  required_since: number;
  updated_at: number;
  updated_by: string | null;
}

/**
 * ORGANIZATION_MFA_GRACE_PERIODS (migration 00048): a member of an
 * organization that requires MFA who has no verified factor, and until when
 * they may enable one.
 */
export interface OrganizationMfaGracePeriodsTable {
  organization_id: OrganizationID;
  uid: string;
  reason: OrganizationMfaGracePeriodReason;
  started_at: number;
  ends_at: number;
  /** When the `organization-mfa-required` email was sent; null until it was. */
  notified_at: number | null;
}

/**
 * ORGANIZATION_MFA_REMOVALS (migration 00050): a member the enforcement job
 * removed from an organization because their grace period ended without MFA.
 */
export interface OrganizationMfaRemovalsTable {
  removal_id: Generated<string>;
  organization_id: OrganizationID;
  uid: string;
  /** The membership role they lost (the highest one, should they have held two). */
  role: OrganizationMembershipRoleType;
  grace_period_reason: OrganizationMfaGracePeriodReason;
  grace_period_ended_at: number;
  removed_at: number;
}

export type OrganizationMfaRequirementRow = Selectable<OrganizationMfaRequirementsTable>;
export type NewOrganizationMfaRequirementRow = Insertable<OrganizationMfaRequirementsTable>;
export type OrganizationMfaRequirementRowUpdate = Updateable<OrganizationMfaRequirementsTable>;

export type OrganizationMfaGracePeriodRow = Selectable<OrganizationMfaGracePeriodsTable>;
export type NewOrganizationMfaGracePeriodRow = Insertable<OrganizationMfaGracePeriodsTable>;
export type OrganizationMfaGracePeriodRowUpdate = Updateable<OrganizationMfaGracePeriodsTable>;

export type OrganizationMfaRemovalRow = Selectable<OrganizationMfaRemovalsTable>;
export type NewOrganizationMfaRemovalRow = Insertable<OrganizationMfaRemovalsTable>;
