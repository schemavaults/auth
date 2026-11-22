import "server-only";

import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import { getDnsVerifiableHostname } from "@/lib/api-server-domain-verification/dns-txt-record";
import {
  API_SERVER_DOMAIN_VERIFICATION_COLUMNS,
  parseApiServerDomainVerificationRow,
  type ApiServerDomainVerificationRow,
} from "./shared";

/** More DNS-verified registrations of one host is not a realistic setup. */
const MAX_ROWS = 200;

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/**
 * @description Every registration, of any API server and in any
 * environment, verified through DNS (`dns_txt`) for a domain on the given
 * host. They were all proven by records published under the same TXT name,
 * so one lookup of that name re-checks them all. Candidates are pre-filtered
 * by scheme + host prefix in SQL and matched on the exact hostname in code
 * (`https://api.example.com.evil.test` shares the prefix but not the host).
 */
export async function listDnsVerifiedDomainRowsOnHost(
  db: Kysely<AuthDatabase>,
  hostname: string,
): Promise<ApiServerDomainVerificationRow[]> {
  const host_pattern: string = escapeLikePattern(hostname);
  const rows = await db
    .selectFrom("api_server_domains")
    .where("verification_method", "=", "dns_txt")
    .where("verified_at", "is not", null)
    .where((eb) =>
      eb.or([
        eb("domain", "like", `https://${host_pattern}%`),
        eb("domain", "like", `http://${host_pattern}%`),
      ]),
    )
    .select(API_SERVER_DOMAIN_VERIFICATION_COLUMNS)
    .limit(MAX_ROWS)
    .execute();
  return rows
    .map(parseApiServerDomainVerificationRow)
    .filter((row) => getDnsVerifiableHostname(row.domain) === hostname);
}

export default listDnsVerifiedDomainRowsOnHost;
