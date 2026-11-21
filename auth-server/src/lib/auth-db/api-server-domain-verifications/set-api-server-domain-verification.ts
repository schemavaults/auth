import "server-only";

import type { ApiServerDomainVerificationMethod } from "@schemavaults/app-definitions";
import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";

/**
 * @description Marks a domain registration verified: RFC 8707 resource URLs
 * on it resolve to its API server from now on.
 */
export async function markApiServerDomainVerified(
  db: Kysely<AuthDatabase>,
  api_server_domain_ref_id: string,
  verification_method: ApiServerDomainVerificationMethod,
  verified_at: number = Date.now(),
): Promise<void> {
  await db
    .updateTable("api_server_domains")
    .set({ verified_at, verification_method })
    .where("api_server_domain_ref_id", "=", api_server_domain_ref_id)
    .execute();
}

/**
 * @description Returns DNS-verified registrations to pending, because the
 * TXT record that verified them is no longer published. Registrations a
 * platform administrator attested are left alone.
 * @returns How many registrations were revoked
 */
export async function revokeDnsDomainVerifications(
  db: Kysely<AuthDatabase>,
  api_server_domain_ref_ids: readonly string[],
): Promise<number> {
  if (api_server_domain_ref_ids.length === 0) return 0;
  const result = await db
    .updateTable("api_server_domains")
    .set({ verified_at: null, verification_method: null })
    .where("api_server_domain_ref_id", "in", [...api_server_domain_ref_ids])
    .where("verification_method", "=", "dns_txt")
    .executeTakeFirst();
  return Number(result.numUpdatedRows);
}
