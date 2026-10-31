/**
 * Organization MFA requirements (ORGANIZATION_MFA_REQUIREMENTS /
 * ORGANIZATION_MFA_GRACE_PERIODS, migration 00048; ORGANIZATION_MFA_REMOVALS,
 * migration 00050). "Has MFA" means at least one verified USER_MFA_FACTORS
 * row (TOTP or passkey), the same test the login MFA challenge applies. Only
 * real membership rows are subject to a requirement: service accounts
 * (virtual members, authenticated by client credentials) and platform
 * administrators' virtual membership of the (hardcoded, unconfigurable)
 * owner organization are not.
 *
 * One query per module; ./shared holds the private helpers.
 */

export type * from "./organization-mfa-requirements-table";
export type { OrganizationMfaGracePeriod, OrganizationMfaRequirement } from "./types";

// The requirement
export { getOrganizationMfaRequirement } from "./get-organization-mfa-requirement";
export { upsertOrganizationMfaRequirement } from "./upsert-organization-mfa-requirement";
export type {
  UpsertOrganizationMfaRequirementParams,
  UpsertOrganizationMfaRequirementResult,
} from "./upsert-organization-mfa-requirement";
export { deleteOrganizationMfaRequirement } from "./delete-organization-mfa-requirement";

// Who has MFA, and who may join
export { userHasVerifiedMfaFactor } from "./user-has-verified-mfa-factor";
export { wouldJoiningViolateOrganizationMfaRequirement } from "./would-joining-violate-organization-mfa-requirement";
export { listOrganizationMembersWithoutMfa } from "./list-organization-members-without-mfa";
export type { OrganizationMemberWithoutMfa } from "./list-organization-members-without-mfa";
export { listUserOrganizationMfaRequirements } from "./list-user-organization-mfa-requirements";
export type { UserOrganizationMfaRequirement } from "./list-user-organization-mfa-requirements";

// Grace periods
export { startMissingOrganizationMfaGracePeriods } from "./start-missing-organization-mfa-grace-periods";
export type { StartMissingOrganizationMfaGracePeriodsParams } from "./start-missing-organization-mfa-grace-periods";
export { clearOrganizationMfaGracePeriodsForUser } from "./clear-organization-mfa-grace-periods-for-user";
export { listMfaSuspendedOrganizationIdsForUser } from "./list-mfa-suspended-organization-ids-for-user";
export {
  listOrganizationMfaGracePeriodsAwaitingNotification,
  markOrganizationMfaGracePeriodNotified,
} from "./organization-mfa-grace-period-notifications";
export type { OrganizationMfaGracePeriodAwaitingNotification } from "./organization-mfa-grace-period-notifications";

// Enforcement and reporting
export { deleteStaleOrganizationMfaGracePeriods } from "./delete-stale-organization-mfa-grace-periods";
export { removeMembersPastOrganizationMfaGracePeriod } from "./remove-members-past-organization-mfa-grace-period";
export type { RemovedOrganizationMfaMember } from "./remove-members-past-organization-mfa-grace-period";
export { loadOrganizationMfaDailyReport } from "./load-organization-mfa-daily-report";
export type {
  OrganizationMfaDailyReport,
  OrganizationMfaRemovalReportEntry,
  OrganizationMfaUpcomingRemoval,
} from "./load-organization-mfa-daily-report";
