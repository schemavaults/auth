import "server-only";
import { getAppEnvironment, getHardcodedApiServerDomain, SCHEMAVAULTS_MAIL_SERVER, type SchemaVaultsApiServerDomainRef } from "@schemavaults/app-definitions";

function getDefaultMailServerUrl(): string {
  const hardcodedApiServerDomain: SchemaVaultsApiServerDomainRef = getHardcodedApiServerDomain(SCHEMAVAULTS_MAIL_SERVER.api_server_id, getAppEnvironment());
  return hardcodedApiServerDomain.domain;
}

export async function sendEmailViaMailServer(
  email_options: object,
  mail_server_access_token: string
): Promise<void> {
  const headers = new Headers();

  headers.set("Content-Type", 'application/json');
  headers.set(`Authorization`, `Bearer: ${mail_server_access_token}`)

  const response = await fetch(
    `${getDefaultMailServerUrl()}/api/send`,
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
