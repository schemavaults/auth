import type { AuditLogEntry, AuditLogParty } from "./audit-log-entry-schema";
import type { AuditEventType } from "./event-types";

/**
 * How the audit log components word an entry (client-safe, plain text).
 * `viewer_uid` is the signed-in user reading the log: entries naming them
 * say "You" / "your account" instead of their e-mail address.
 */

export const AUDIT_EVENT_LABELS: Record<AuditEventType, string> = {
  "user.registered": "Account created",
  "user.signed_in": "Signed in",
  "user.sign_in_failed": "Sign-in refused",
  "user.mfa_challenge_failed": "MFA challenge failed",
  "user.signed_out": "Signed out",
  "user.password_reset": "Password reset",
  "user.email_verified": "Email verified",
  "user.profile_updated": "Profile updated",
  "user.mfa_factor_added": "MFA factor added",
  "user.mfa_factor_removed": "MFA factor removed",
  "user.mfa_recovery_codes_regenerated": "Recovery codes regenerated",
  "user.mfa_reset_by_admin": "MFA reset by an administrator",
  "user.app_authorized": "Application authorized",
  "user.app_authorization_revoked": "Application access revoked",
  "user.app_scope_consent_revoked": "Application permission withdrawn",
  "user.disabled": "Account disabled",
  "user.enabled": "Account re-enabled",
  "user.promoted_to_admin": "Promoted to administrator",
  "organization.created": "Organization created",
  "organization.deleted": "Organization deleted",
  "organization.invitation_sent": "Invitation sent",
  "organization.invitation_revoked": "Invitation revoked",
  "organization.invitation_accepted": "Invitation accepted",
  "organization.invitation_declined": "Invitation declined",
  "organization.member_added": "Member added",
  "organization.member_role_changed": "Member role changed",
  "organization.member_removed": "Member removed",
  "organization.mfa_requirement_enabled": "MFA requirement enabled",
  "organization.mfa_requirement_updated": "MFA requirement updated",
  "organization.mfa_requirement_disabled": "MFA requirement disabled",
};

/** Events worth a warning colour: something was refused, removed or weakened. */
const WARNING_EVENT_TYPES: ReadonlySet<AuditEventType> = new Set<AuditEventType>([
  "user.sign_in_failed",
  "user.mfa_challenge_failed",
  "user.mfa_factor_removed",
  "user.mfa_reset_by_admin",
  "user.disabled",
  "organization.deleted",
  "organization.member_removed",
  "organization.mfa_requirement_disabled",
]);

export function isWarningAuditEvent(event_type: AuditEventType): boolean {
  return WARNING_EVENT_TYPES.has(event_type);
}

function isViewer(party: AuditLogParty | null, viewer_uid: string | undefined): boolean {
  return party !== null && party.uid !== null && party.uid === viewer_uid;
}

function nameOf(party: AuditLogParty | null, viewer_uid: string | undefined, fallback: string): string {
  if (party === null) return fallback;
  if (isViewer(party, viewer_uid)) return "you";
  return party.email ?? "a deleted user";
}

/** Starts a sentence with `text`; an e-mail address is left as it is written. */
function capitalize(text: string): string {
  return text.includes("@") ? text : text.charAt(0).toUpperCase() + text.slice(1);
}

function detail(entry: AuditLogEntry, key: string): string | null {
  const value: unknown = entry.details?.[key];
  if (typeof value === "string" && value.length > 0) return value;
  if (typeof value === "number") return String(value);
  return null;
}

function factorName(entry: AuditLogEntry): string {
  switch (detail(entry, "factor_type")) {
    case "totp":
      return "an authenticator app";
    case "webauthn": {
      const label = detail(entry, "label");
      return label ? `the passkey '${label}'` : "a passkey";
    }
    default:
      return "an MFA factor";
  }
}

/** One sentence saying what happened in `entry`. */
export function describeAuditEvent(entry: AuditLogEntry, viewer_uid?: string): string {
  const actor: string = capitalize(nameOf(entry.actor, viewer_uid, "the server"));
  const subject: string = nameOf(entry.subject, viewer_uid, "a user");
  const subjectIsViewer: boolean = isViewer(entry.subject, viewer_uid);
  const account: string = subjectIsViewer ? "your account" : `the account of ${subject}`;
  const app: string | null = entry.client_app_id;

  switch (entry.event_type) {
    case "user.registered":
      return `${actor} created the account.`;
    case "user.signed_in":
      return `${actor} signed in${app ? ` to ${app}` : ""}${entry.details?.mfa === true ? " with multi-factor authentication" : ""}.`;
    case "user.sign_in_failed":
      return detail(entry, "reason") === "account_disabled"
        ? `A sign-in to ${account} was refused because the account is disabled.`
        : `A sign-in to ${account} with a wrong password was refused.`;
    case "user.mfa_challenge_failed":
      return `A wrong multi-factor authentication proof was presented while signing in to ${account}.`;
    case "user.signed_out":
      return `${actor} signed out${app ? ` of ${app}` : ""}.`;
    case "user.password_reset":
      return `The password of ${account} was reset with an emailed link, which signed out every session.`;
    case "user.email_verified":
      return `The email address of ${account} was verified.`;
    case "user.profile_updated":
      return `${actor} updated the profile names.`;
    case "user.mfa_factor_added":
      return `${actor} added ${factorName(entry)} as an MFA factor.`;
    case "user.mfa_factor_removed":
      return `${actor} removed ${factorName(entry)}${entry.details?.last_factor === true ? ", the last MFA factor of the account" : ""}.`;
    case "user.mfa_recovery_codes_regenerated":
      return `${actor} regenerated the MFA recovery codes; the previous codes stopped working.`;
    case "user.mfa_reset_by_admin":
      return `${actor} removed every MFA factor and recovery code of ${account}.`;
    case "user.app_authorized":
      return `${actor} authorized ${app ?? "an application"} to sign in with the account.`;
    case "user.app_authorization_revoked":
      return `${actor} revoked the access of ${app ?? "an application"}.`;
    case "user.app_scope_consent_revoked": {
      const scope = detail(entry, "scope");
      return `${actor} withdrew ${scope ? `the '${scope}' permission` : "a permission"} from ${app ?? "an application"}.`;
    }
    case "user.disabled":
      return `${actor} disabled ${account} and signed out its sessions.`;
    case "user.enabled":
      return `${actor} re-enabled ${account}.`;
    case "user.promoted_to_admin":
      return `${actor} made ${subject} a platform administrator.`;
    case "organization.created":
      return `${actor} created the organization.`;
    case "organization.deleted": {
      const organization_id = detail(entry, "organization_id");
      return `${actor} deleted the organization${organization_id ? ` '${organization_id}'` : ""}.`;
    }
    case "organization.invitation_sent":
      return `${actor} invited ${subject} to the organization.`;
    case "organization.invitation_revoked":
      return `${actor} revoked the invitation of ${subject}.`;
    case "organization.invitation_accepted":
      return `${actor} accepted the invitation and joined the organization.`;
    case "organization.invitation_declined":
      return `${actor} declined the invitation.`;
    case "organization.member_added": {
      const role = detail(entry, "role");
      return `${actor} added ${subject} to the organization${role ? ` as ${role}` : ""}.`;
    }
    case "organization.member_role_changed": {
      const role = detail(entry, "role");
      return `${actor} changed the role of ${subject}${role ? ` to ${role}` : ""}.`;
    }
    case "organization.member_removed": {
      const because: string =
        detail(entry, "reason") === "mfa_requirement_grace_period_ended"
          ? " because the grace period to enable multi-factor authentication ended"
          : "";
      return entry.actor === null
        ? `${capitalize(subject)} ${subjectIsViewer ? "were" : "was"} removed from the organization${because}.`
        : `${actor} removed ${subject} from the organization${because}.`;
    }
    case "organization.mfa_requirement_enabled": {
      const days = detail(entry, "grace_period_days");
      return `${actor} required multi-factor authentication of the organization's members${days ? ` (grace period: ${days} days)` : ""}.`;
    }
    case "organization.mfa_requirement_updated": {
      const days = detail(entry, "grace_period_days");
      return `${actor} changed the MFA requirement's grace period${days ? ` to ${days} days` : ""}.`;
    }
    case "organization.mfa_requirement_disabled":
      return `${actor} stopped requiring multi-factor authentication of the organization's members.`;
  }
}
