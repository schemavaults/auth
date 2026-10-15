import "server-only";
import { getAppEnvironment, getAuthServerUrl, type SchemaVaultsAppEnvironment } from "@schemavaults/app-definitions";
import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import sendEmailViaMailServer from "./send-email-via-mail-server";
import type { RedisCache } from "@/lib/redis";
import getAuthServerFriendlyName from "@/lib/config/auth-server-friendly-name";
import sendAndLogUserEmail, { type UserEmailLogDetails } from "./user-email-log";

interface SendPasswordResetEmailOptions extends UserEmailLogDetails {
  email: string;
  rawToken: string;
  db: Kysely<AuthDatabase>;
  redis: RedisCache;
}

/**
 * Send a password reset message linking to `/auth/reset-password?token=<token>`.
 * The attempt is recorded in the user's e-mail log (`uid`, `source`, `requested_by`).
 */
export async function sendPasswordResetEmail({
  email,
  rawToken,
  db,
  redis,
  uid,
  source,
  requested_by,
}: SendPasswordResetEmailOptions): Promise<void> {
  const appEnv: SchemaVaultsAppEnvironment = getAppEnvironment();
  const authServerUri: string = getAuthServerUrl(appEnv);
  const resetLink: string = `${authServerUri}/auth/reset-password?token=${rawToken}`;
  const friendlyName: string = getAuthServerFriendlyName();

  await sendAndLogUserEmail({
    db,
    email_type: "password_reset",
    recipient: email,
    uid,
    source,
    requested_by,
    send: () =>
      sendEmailViaMailServer(
        {
          to: email,
          subject: `Reset your ${friendlyName} password`,
          message: {
            text: `You requested a password reset for your ${friendlyName} account.\n\nClick the link below to set a new password:\n${resetLink}\n\nThis link will expire in 1 hour.\n\nIf you did not request this, you can safely ignore this email.`,
            html: `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
<h2>Reset your password</h2>
<p>You requested a password reset for your ${friendlyName} account.</p>
<p>Click the button below to set a new password:</p>
<p style="margin: 24px 0;">
  <a href="${resetLink}" style="background-color: #22c55e; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600;">Reset Password</a>
</p>
<p style="color: #666; font-size: 14px;">This link will expire in 1 hour.</p>
<p style="color: #666; font-size: 14px;">If you did not request this, you can safely ignore this email.</p>
<hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
<p style="color: #999; font-size: 12px;">${friendlyName}</p>
</div>`,
          },
        },
        db,
        redis
      ),
  });
}

export default sendPasswordResetEmail;
