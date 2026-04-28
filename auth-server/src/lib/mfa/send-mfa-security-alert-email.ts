import "server-only";
import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import sendEmailViaMailServer from "@/lib/send-email-via-mail-server";

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

const SUMMARY: Record<MfaSecurityAlertAction, string> = {
  enabled:
    "Multi-factor authentication was just enabled on your SchemaVaults account.",
  removed:
    "Multi-factor authentication was just removed from your SchemaVaults account.",
  admin_reset:
    "An administrator has reset multi-factor authentication on your SchemaVaults account. You may need to re-enroll an authenticator app to log in.",
  recovery_codes_regenerated:
    "Your SchemaVaults MFA recovery codes were just regenerated. Previous codes are no longer valid.",
};

// Best-effort security alert. Never throws — failures are logged so the
// caller's MFA mutation completes regardless of mail-server health.
export async function sendMfaSecurityAlertEmail(args: {
  to: string;
  action: MfaSecurityAlertAction;
  db: Kysely<AuthDatabase>;
}): Promise<void> {
  const subject = SUBJECT[args.action];
  const summary = SUMMARY[args.action];
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
    );
  } catch (e: unknown) {
    console.warn(
      `[sendMfaSecurityAlertEmail] Failed to send '${args.action}' alert to ${args.to}:`,
      e,
    );
  }
}
