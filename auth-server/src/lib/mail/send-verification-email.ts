import "server-only";
import { getAppEnvironment, getAuthServerUrl, type SchemaVaultsAppEnvironment } from "@schemavaults/app-definitions";
import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import sendEmailViaMailServer from "./send-email-via-mail-server";
import type { RedisCache } from "@/lib/redis";
import getAuthServerFriendlyName from "@/lib/config/auth-server-friendly-name";
import sendAndLogUserEmail, { type UserEmailLogDetails } from "./user-email-log";

interface SendVerificationEmailOptions extends UserEmailLogDetails {
  email: string;
  rawToken: string;
  db: Kysely<AuthDatabase>;
  redis: RedisCache;
  welcomeMessage?: string;
}

/**
 * Send an email verification message using the mail-server's "verify-email" template.
 * Builds the verify link from the auth-server URI plus the raw token, so the recipient
 * lands on `/auth/verify-email?token=<token>` when they click through.
 * The attempt is recorded in the user's e-mail log (`uid`, `source`, `requested_by`).
 */
export async function sendVerificationEmail({
  email,
  rawToken,
  db,
  redis,
  welcomeMessage,
  uid,
  source,
  requested_by,
}: SendVerificationEmailOptions): Promise<void> {
  const appEnv: SchemaVaultsAppEnvironment = getAppEnvironment();
  const authServerUri: string = getAuthServerUrl(appEnv);

  const verifyUrl = new URL(
    `/auth/verify-email?token=${encodeURIComponent(rawToken)}`,
    authServerUri
  );

  await sendAndLogUserEmail({
    db,
    email_type: "email_verification",
    recipient: email,
    uid,
    source,
    requested_by,
    send: () =>
      sendEmailViaMailServer(
        {
          to: email,
          subject: `Verify your ${getAuthServerFriendlyName()} email`,
          message: {
            template_id: "verify-email",
            template_props: {
              url: verifyUrl.toString(),
              ...(welcomeMessage ? { welcomeMessage } : {}),
            },
          },
        },
        db,
        redis
      ),
  });
}

export default sendVerificationEmail;
