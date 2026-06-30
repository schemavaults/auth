import "server-only";
import { getAppEnvironment, SCHEMAVAULTS_AUTH_APP_ID, SchemaVaultsAppEnvironment, type SchemaVaultsApiServerDomainRef } from "@schemavaults/app-definitions";
import { createSendEmailRequestBodySchema, type SendEmailRequestBody } from "@schemavaults/send-email"
import spoofSuperuserAccessToken from "@/lib/spoofSuperuserAccessToken";
import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import shouldEnableDebug from "@/lib/should-enable-debug";
import type { AccessToken } from "@schemavaults/auth-common";
import resolveMailServerUrl from "./resolve-mail-server-url";
import type { RedisCache } from "@/lib/redis";
import resolveMailServerId from "./resolve-mail-server-id";

const sendEmailRequestBodySchema = createSendEmailRequestBodySchema(true);

/**
 * @description Send a raw email plaintext/html message (or use a template ID from @schemavaults/mail-server).
 * This will spoof a superuser access token to convince the mail-server that we're allowed to send emails.
 *
 * @param email_options Object defining the email to be sent. E.g. to, from, message/template ID
 * @params db We need access to the database to load jwt keys to spoof an access token for the mail-server audience.
 * @returns A promise resolving if the message is sent successfully
 */
export async function sendEmailViaMailServer(
  email_options: SendEmailRequestBody,
  db: Kysely<AuthDatabase>,
  redis: RedisCache,
  environment: SchemaVaultsAppEnvironment = getAppEnvironment()
): Promise<void> {
  const debug: boolean = shouldEnableDebug(environment);

  const mail_api_server_id: string = await resolveMailServerId(db, redis);
  if (typeof mail_api_server_id !== 'string') {
    throw new TypeError("Expected result of resolveMailServerId to be a string!")
  }

  const mail_server_url: string = await resolveMailServerUrl(db, mail_api_server_id, environment);

  const parsed_email_options = await sendEmailRequestBodySchema.safeParseAsync(email_options)
  if (!parsed_email_options.success) {
    console.error("Invalid options to send email with: ", parsed_email_options.error);
    throw new TypeError("Invalid options to send email with!")
  }

  const headers = new Headers();

  const mail_server_access_token: AccessToken = await spoofSuperuserAccessToken({
    client_app_id: SCHEMAVAULTS_AUTH_APP_ID,
    audience_id: mail_api_server_id,
    db
  });

  headers.set("Content-Type", 'application/json');
  headers.set(`Authorization`, `Bearer ${mail_server_access_token.token satisfies string}`)

  const endpoint: string = `${mail_server_url}/api/send`;

  if (debug) {
    console.log(`[sendEmailViaMailServer] Sending email via "${endpoint}" with options: ${JSON.stringify(email_options)}`)
  }

  const response = await fetch(
    endpoint,
    {
      method: "POST",
      headers,
      body: JSON.stringify(email_options)
    }
  );
  if (response.ok && response.status >= 200 && response.status < 300) {
    return;
  }
  throw new Error(`Failed to send email via mail server /api/send endpoint: ${response.status} ${response.statusText}`)
}

export default sendEmailViaMailServer;
