import "server-only";

import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import {
  API_SERVER_DOMAIN_VERIFICATION_COLUMNS,
  parseApiServerDomainVerificationRow,
  type ApiServerDomainVerificationRow,
} from "./shared";

/**
 * @description Every domain registration of an API server with its
 * verification state (the same 50-row cap as `getApiServerDomains()`).
 * Hardcoded API servers have no rows.
 */
export async function listApiServerDomainVerificationRows(
  db: Kysely<AuthDatabase>,
  api_server_id: string,
): Promise<ApiServerDomainVerificationRow[]> {
  const rows = await db
    .selectFrom("api_server_domains")
    .where("api_server_id", "=", api_server_id)
    .select(API_SERVER_DOMAIN_VERIFICATION_COLUMNS)
    .limit(50)
    .execute();
  return rows.map(parseApiServerDomainVerificationRow);
}

export default listApiServerDomainVerificationRows;
