import "server-only";
import { getAppEnvironment, getAuthServerUri, type SchemaVaultsAppEnvironment } from "@schemavaults/app-definitions";
import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import sendEmailViaMailServer from "./send-email-via-mail-server";

interface SendVerificationEmailOptions {
  email: string;
  rawToken: string;
  db: Kysely<AuthDatabase>;
  welcomeMessage?: string;
}

/**
 * Send an email verification message using the mail-server's "verify-email" template.
 * Builds the verify link from the auth-server URI plus the raw token, so the recipient
 * lands on `/auth/verify-email?token=<token>` when they click through.
 */
export async function sendVerificationEmail({
  email,
  rawToken,
  db,
  welcomeMessage,
}: SendVerificationEmailOptions): Promise<void> {
  const appEnv: SchemaVaultsAppEnvironment = getAppEnvironment();
  const authServerUri: string = getAuthServerUri(appEnv);
  const verifyUrl: string = `${authServerUri}/auth/verify-email?token=${rawToken}`;

  await sendEmailViaMailServer(
    {
      to: email,
      subject: "Verify your SchemaVaults email",
      message: {
        template_id: "verify-email",
        template_props: {
          url: verifyUrl,
          ...(welcomeMessage ? { welcomeMessage } : {}),
        },
      },
    },
    db,
  );
}

export default sendVerificationEmail;
