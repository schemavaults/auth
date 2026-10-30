/**
 * The `security-alert` template props of the auth server's MFA alerts, and
 * how each alert is recorded in the user's e-mail log. The mail server's
 * template requires `name` and only knows its own `eventType` values, so
 * every alert must carry both (the template refuses anything else, and
 * without an event type it would render a "new sign-in" alert).
 */

import type {
  UserEmailLogEmailType,
  UserEmailLogSource,
} from "@/lib/auth-db/user-email-log/user-email-log-table";

export type MfaSecurityAlertAction =
  | "enabled"
  | "removed"
  | "admin_reset"
  | "recovery_codes_regenerated";

/** The mail server's `security-alert` event type of each action. */
export const MFA_SECURITY_ALERT_EVENT_TYPES = {
  enabled: "mfa-enabled",
  removed: "mfa-removed",
  admin_reset: "mfa-reset-by-admin",
  recovery_codes_regenerated: "mfa-recovery-codes-regenerated",
} as const satisfies Record<MfaSecurityAlertAction, string>;

export interface MfaSecurityAlertTemplateProps {
  name: string;
  eventType: (typeof MFA_SECURITY_ALERT_EVENT_TYPES)[MfaSecurityAlertAction];
  eventTime: string;
  secureAccountUrl: string;
  productName: string;
}

/** How the email greets the user: their display name, first name, or e-mail address. */
export function getMfaSecurityAlertRecipientName(user: {
  email: string;
  display_name?: string | null;
  first_name?: string | null;
}): string {
  for (const candidate of [user.display_name, user.first_name]) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }
  return user.email;
}

export function buildMfaSecurityAlertTemplateProps({
  action,
  name,
  occurred_at,
  auth_server_url,
  product_name,
}: {
  action: MfaSecurityAlertAction;
  name: string;
  /** Unix epoch milliseconds the change happened. */
  occurred_at: number;
  auth_server_url: string;
  product_name: string;
}): MfaSecurityAlertTemplateProps {
  return {
    name,
    eventType: MFA_SECURITY_ALERT_EVENT_TYPES[action],
    eventTime: new Date(occurred_at).toUTCString(),
    secureAccountUrl: `${auth_server_url}/mfa`,
    productName: product_name,
  };
}

/** The USER_EMAIL_LOG `email_type` of each alert. */
export const MFA_SECURITY_ALERT_EMAIL_LOG_TYPES = {
  enabled: "mfa_enabled_alert",
  removed: "mfa_removed_alert",
  admin_reset: "mfa_admin_reset_alert",
  recovery_codes_regenerated: "mfa_recovery_codes_regenerated_alert",
} as const satisfies Record<MfaSecurityAlertAction, UserEmailLogEmailType>;

/**
 * How an alert is recorded in USER_EMAIL_LOG: the administrator's reset is
 * an `admin_request` naming them, every other alert follows a change the
 * user made themselves (`user_request`).
 */
export function getMfaSecurityAlertEmailLogDetails(
  action: MfaSecurityAlertAction,
  requested_by: string | null = null,
): { email_type: UserEmailLogEmailType; source: UserEmailLogSource; requested_by: string | null } {
  const source: UserEmailLogSource = action === "admin_reset" ? "admin_request" : "user_request";
  return {
    email_type: MFA_SECURITY_ALERT_EMAIL_LOG_TYPES[action],
    source,
    requested_by: source === "admin_request" ? requested_by : null,
  };
}
