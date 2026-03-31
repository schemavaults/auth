import "server-only";
import { getAppEnvironment, getHardcodedApiServerDomain, SCHEMAVAULTS_MAIL_SERVER, type SchemaVaultsApiServerDomainRef } from "@schemavaults/app-definitions";
import { sendEmailRequestBodySchema, type SendEmailRequestBody } from "@schemavaults/send-email-api-options"

function getDefaultMailServerUrl(): string {
  const hardcodedApiServerDomain: SchemaVaultsApiServerDomainRef = getHardcodedApiServerDomain(SCHEMAVAULTS_MAIL_SERVER.api_server_id, getAppEnvironment());
  return hardcodedApiServerDomain.domain;
}

export async function sendEmailViaMailServer(
  email_options: SendEmailRequestBody,
  mail_server_access_token: string
): Promise<void> {
  const mail_server_url: string = getDefaultMailServerUrl()

  const parsed_email_options = await sendEmailRequestBodySchema.safeParseAsync(email_options)
  if (!parsed_email_options.success) {
    console.error("Invalid options to send email with: ", parsed_email_options.error);
    throw new TypeError("Invalid options to send email with!")
  }

  const headers = new Headers();

  headers.set("Content-Type", 'application/json');
  headers.set(`Authorization`, `Bearer ${mail_server_access_token}`)

  const response = await fetch(
    `${mail_server_url}/api/send`,
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
