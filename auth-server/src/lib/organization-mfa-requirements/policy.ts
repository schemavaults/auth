/**
 * The client-safe rules of organization MFA requirements (migration 00048):
 * grace period bounds and the status of a member's grace period. Imported by
 * the server and by the organization page's requirement card, so this module
 * must stay free of server-only imports.
 */

/** Grace period offered when an owner does not choose one. */
export const DEFAULT_ORGANIZATION_MFA_GRACE_PERIOD_DAYS = 14;
/** Bounds of `grace_period_days` (also a CHECK constraint of the table). */
export const MIN_ORGANIZATION_MFA_GRACE_PERIOD_DAYS = 1;
export const MAX_ORGANIZATION_MFA_GRACE_PERIOD_DAYS = 90;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Why a member's grace period started: the organization turned the
 * requirement on while they had no MFA, or they lost their last factor
 * (removed it themselves, or an administrator reset it) while a member.
 */
export const organizationMfaGracePeriodReasons = [
  "requirement_enabled",
  "mfa_removed",
] as const;
export type OrganizationMfaGracePeriodReason =
  (typeof organizationMfaGracePeriodReasons)[number];

/** When a grace period started at `started_at` ends. */
export function computeOrganizationMfaGracePeriodEndsAt(
  started_at: number,
  grace_period_days: number,
): number {
  return started_at + grace_period_days * DAY_MS;
}

/**
 * Where a member without MFA stands in an organization that requires it:
 * - `pending`: no grace period yet (they lost their factor moments ago; the
 *   enforcement job or the MFA removal starts one);
 * - `grace_period`: they may still enable MFA until `ends_at`;
 * - `expired`: the grace period ended. They no longer count as a member and
 *   the enforcement job removes them.
 */
export type OrganizationMfaComplianceStatus = "pending" | "grace_period" | "expired";

export function getOrganizationMfaComplianceStatus(
  grace_period_ends_at: number | null,
  now: number,
): OrganizationMfaComplianceStatus {
  if (grace_period_ends_at === null) return "pending";
  return grace_period_ends_at <= now ? "expired" : "grace_period";
}
