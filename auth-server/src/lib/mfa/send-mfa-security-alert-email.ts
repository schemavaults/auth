import "server-only";
import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import sendEmailViaMailServer from "@/lib/mail/send-email-via-mail-server";
import { getAppEnvironment, type SchemaVaultsAppEnvironment } from "@schemavaults/app-definitions";
import type { RedisCache } from "@/lib/redis";
import getAuthServerFriendlyName from "@/lib/config/auth-server-friendly-name";

export type MfaSecurityAlertAction =
  | "enabled"
  | "removed"
  | "admin_reset"
  | "recovery_codes_regenerated";

const SUBJECT: Record<MfaSecurityAlertAction, string> = {
  enabled: "Multi-factor authentication enabled",
  removed: "Multi-factor authentication removed",
  admin_reset:
    "Your multi-factor authentication has been reset by an administrator",
  recovery_codes_regenerated: "Your MFA recovery codes were regenerated",
};

function buildSummary(
  action: MfaSecurityAlertAction,
  friendlyName: string,
): string {
  const SUMMARY: Record<MfaSecurityAlertAction, string> = {
    enabled: `Multi-factor authentication was just enabled on your ${friendlyName} account.`,
    removed: `Multi-factor authentication was just removed from your ${friendlyName} account.`,
    admin_reset: `An administrator has reset multi-factor authentication on your ${friendlyName} account. You may need to re-enroll an authenticator app to log in.`,
    recovery_codes_regenerated: `Your ${friendlyName} MFA recovery codes were just regenerated. Previous codes are no longer valid.`,
  };
  return SUMMARY[action];
}

// Best-effort security alert. Never throws — failures are logged so the
// caller's MFA mutation completes regardless of mail-server health.
export async function sendMfaSecurityAlertEmail(args: {
  to: string;
  action: MfaSecurityAlertAction;
  db: Kysely<AuthDatabase>;
  redis: RedisCache;
  environment?: SchemaVaultsAppEnvironment
}): Promise<void> {
  const subject = SUBJECT[args.action];
  const summary = buildSummary(args.action, getAuthServerFriendlyName());
  try {
    await sendEmailViaMailServer(
      {
        to: args.to,
        subject,
        message: {
          template_id: "security-alert",
          template_props: {
            action: args.action,
            summary,
          },
        },
      },
      args.db,
      args.redis,
      args.environment ?? getAppEnvironment()
    );
  } catch (e: unknown) {
    console.warn(
      `[sendMfaSecurityAlertEmail] Failed to send '${args.action}' alert to ${args.to}:`,
      e,
    );
  }
}
