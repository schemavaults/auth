/**
 * The events recorded in AUDIT_EVENTS (migration 00054). Client-safe: the
 * audit log components import the list to label entries.
 *
 * `user.*` events are about an account and appear in that user's log
 * (`/account/audit-log`); `organization.*` events appear in the
 * organization's log (`/orgs/{organization_id}/audit-log`) and in the log
 * of every user they name (who did it, and who it was done to).
 *
 * Adding an event: add it here, give it a label and a description in
 * ./describe-audit-event.ts, and record it with recordAuditEvent() where
 * the action succeeds.
 */
export const auditEventTypes = [
  "user.registered",
  "user.signed_in",
  "user.sign_in_failed",
  "user.mfa_challenge_failed",
  "user.signed_out",
  "user.password_reset",
  "user.email_verified",
  "user.profile_updated",
  "user.mfa_factor_added",
  "user.mfa_factor_removed",
  "user.mfa_recovery_codes_regenerated",
  "user.mfa_reset_by_admin",
  "user.app_authorized",
  "user.app_authorization_revoked",
  "user.app_scope_consent_revoked",
  "user.disabled",
  "user.enabled",
  "user.promoted_to_admin",
  "organization.created",
  "organization.deleted",
  "organization.invitation_sent",
  "organization.invitation_revoked",
  "organization.invitation_accepted",
  "organization.invitation_declined",
  "organization.member_added",
  "organization.member_role_changed",
  "organization.member_removed",
  "organization.mfa_requirement_enabled",
  "organization.mfa_requirement_updated",
  "organization.mfa_requirement_disabled",
] as const;

export type AuditEventType = (typeof auditEventTypes)[number];

export function isAuditEventType(value: unknown): value is AuditEventType {
  return typeof value === "string" && (auditEventTypes as readonly string[]).includes(value);
}

/** Longest `User-Agent` stored with an event; longer ones are cut off. */
export const MAX_AUDIT_EVENT_USER_AGENT_LENGTH = 512;

/** Default and largest page size of the audit log listings. */
export const DEFAULT_AUDIT_LOG_PAGE_SIZE = 25;
export const MAX_AUDIT_LOG_PAGE_SIZE = 100;
