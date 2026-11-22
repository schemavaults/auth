import "server-only";

import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import {
  API_SERVER_DOMAIN_VERIFICATION_COLUMNS,
  parseApiServerDomainVerificationRow,
  type ApiServerDomainVerificationRow,
} from "./shared";

/**
 * @description Loads one domain registration of an API server with its
 * verification state.
 * @returns null when the API server has no domain with that ref id
 */
export async function getApiServerDomainVerificationRow(
  db: Kysely<AuthDatabase>,
  api_server_id: string,
  api_server_domain_ref_id: string,
): Promise<ApiServerDomainVerificationRow | null> {
  const row = await db
    .selectFrom("api_server_domains")
    .where("api_server_id", "=", api_server_id)
    .where("api_server_domain_ref_id", "=", api_server_domain_ref_id)
    .select(API_SERVER_DOMAIN_VERIFICATION_COLUMNS)
    .executeTakeFirst();
  return row ? parseApiServerDomainVerificationRow(row) : null;
}

export default getApiServerDomainVerificationRow;
