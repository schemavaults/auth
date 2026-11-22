import "server-only";

import { isHardcodedApiServerId, type ApiServerDomainVerification } from "@schemavaults/app-definitions";
import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import { listApiServerDomainVerificationRows } from "@/lib/auth-db/api-server-domain-verifications";
import { toApiServerDomainVerification } from "./to-api-server-domain-verification";

/**
 * @description The verification state of every domain registered for an
 * API server, one entry per `api_server_domain_ref_id`. Hardcoded API
 * servers take their domains from the server's configuration (they are not
 * registrations and never resolve resource URLs), so they have none.
 */
export async function listApiServerDomainVerifications(
  db: Kysely<AuthDatabase>,
  api_server_id: string,
): Promise<ApiServerDomainVerification[]> {
  if (isHardcodedApiServerId(api_server_id)) return [];
  const rows = await listApiServerDomainVerificationRows(db, api_server_id);
  return rows.map(toApiServerDomainVerification);
}

export default listApiServerDomainVerifications;
