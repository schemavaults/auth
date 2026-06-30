
import MailServerNotConfiguredError from "@/lib/error/MailServerNotConfiguredError";
import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import { SchemaVaultsApiServerRegistry } from "@/lib/auth-db/apis";
import { getAppEnvironment, type SchemaVaultsApiServerDomainRef, type SchemaVaultsAppEnvironment, type SchemaVaultsApiServerDefinition } from "@schemavaults/app-definitions";


export default async function resolveMailServerUrl(
  db: Kysely<AuthDatabase>,
  mail_api_server_id: string,
  environment: SchemaVaultsAppEnvironment = getAppEnvironment()
): Promise<string> {
  const apis = new SchemaVaultsApiServerRegistry(db);
  const mailApiServerDefinition: SchemaVaultsApiServerDefinition | null = await apis.getApiServer(mail_api_server_id);
  if (!mailApiServerDefinition) {
    throw new MailServerNotConfiguredError("Failed to find mail server API definition in database!", {
      cause: `No API server found with ID: '${mail_api_server_id}'`
    });
  }
  const savedDomains = await apis.getApiServerDomains(mail_api_server_id);
  if (!Array.isArray(savedDomains)) {
    throw new TypeError("Expected result of getApiServerDomains to be an array!")
  }
  const relevantSavedDomains = savedDomains.filter(domain => domain.environment === environment && domain.api_server_id === mail_api_server_id)
  if (relevantSavedDomains.length === 0 || !relevantSavedDomains[0]) {
    throw new MailServerNotConfiguredError("Failed to find mail server URL in database!", {
      cause: `No API server domains found in environment '${environment}' for API: '${mail_api_server_id}'`
    });
  }
  const first: SchemaVaultsApiServerDomainRef = relevantSavedDomains[0];
  return first.domain;
}
