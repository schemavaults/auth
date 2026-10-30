import "server-only";
import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import sendEmailViaMailServer from "@/lib/mail/send-email-via-mail-server";
import {
  getAppEnvironment,
  getAuthServerUrl,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import type { RedisCache } from "@/lib/redis";
import getAuthServerFriendlyName from "@/lib/config/auth-server-friendly-name";
import captureServerException from "@/lib/captureServerException";
import { getUserByUID } from "@/lib/auth-db/users/get-user-by-uid";
import sendAndLogUserEmail from "@/lib/mail/user-email-log";
import {
  buildMfaSecurityAlertTemplateProps,
  getMfaSecurityAlertEmailLogDetails,
  getMfaSecurityAlertRecipientName,
  type MfaSecurityAlertAction,
} from "./mfa-security-alert-template-props";

export type { MfaSecurityAlertAction } from "./mfa-security-alert-template-props";

const SUBJECT: Record<MfaSecurityAlertAction, string> = {
  enabled: "Multi-factor authentication enabled",
  removed: "Multi-factor authentication removed",
  admin_reset:
    "Your multi-factor authentication has been reset by an administrator",
  recovery_codes_regenerated: "Your MFA recovery codes were regenerated",
};

// Best-effort security alert. Never throws — failures are recorded to the
// ERRORS table so the caller's MFA mutation completes regardless of
// mail-server health. Every attempt, sent or failed, is also recorded in the
// user's e-mail log (USER_EMAIL_LOG, the "Email Log" on /admin/users/[uid]).
export async function sendMfaSecurityAlertEmail(args: {
  /** The user whose MFA changed (their name greets them). */
  uid: string;
  to: string;
  action: MfaSecurityAlertAction;
  /** The administrator behind an `admin_reset` (recorded in the e-mail log). */
  requested_by?: string;
  db: Kysely<AuthDatabase>;
  redis: RedisCache;
  environment?: SchemaVaultsAppEnvironment
}): Promise<void> {
  const occurred_at: number = Date.now();
  const environment: SchemaVaultsAppEnvironment = args.environment ?? getAppEnvironment();
  try {
    await sendAndLogUserEmail({
      db: args.db,
      recipient: args.to,
      uid: args.uid,
      ...getMfaSecurityAlertEmailLogDetails(args.action, args.requested_by),
      send: async (): Promise<void> => {
        const user = await getUserByUID(args.db, args.uid);
        await sendEmailViaMailServer(
          {
            to: args.to,
            subject: SUBJECT[args.action],
            message: {
              template_id: "security-alert",
              template_props: buildMfaSecurityAlertTemplateProps({
                action: args.action,
                name: getMfaSecurityAlertRecipientName(user ?? { email: args.to }),
                occurred_at,
                auth_server_url: getAuthServerUrl(environment),
                product_name: getAuthServerFriendlyName(),
              }),
            },
          },
          args.db,
          args.redis,
          environment,
        );
      },
    });
  } catch (e: unknown) {
    console.warn(
      `[sendMfaSecurityAlertEmail] Failed to send '${args.action}' alert to ${args.to}:`,
      e,
    );
    await captureServerException(args.db, e, {
      op_name: "sendMfaSecurityAlertEmail",
      uid: args.uid,
      context: { action: args.action, nonFatal: true },
    });
  }
}
