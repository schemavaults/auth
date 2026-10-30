import type { Insertable, Selectable, Updateable } from "@schemavaults/dbh";
import type { OrganizationID } from "@schemavaults/auth-common";
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

export type OrganizationMfaRequirementRow = Selectable<OrganizationMfaRequirementsTable>;
export type NewOrganizationMfaRequirementRow = Insertable<OrganizationMfaRequirementsTable>;
export type OrganizationMfaRequirementRowUpdate = Updateable<OrganizationMfaRequirementsTable>;

export type OrganizationMfaGracePeriodRow = Selectable<OrganizationMfaGracePeriodsTable>;
export type NewOrganizationMfaGracePeriodRow = Insertable<OrganizationMfaGracePeriodsTable>;
export type OrganizationMfaGracePeriodRowUpdate = Updateable<OrganizationMfaGracePeriodsTable>;
