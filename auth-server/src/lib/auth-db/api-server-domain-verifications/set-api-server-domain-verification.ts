import "server-only";

import type { ApiServerDomainVerificationMethod } from "@schemavaults/app-definitions";
import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import type { ApiServerDomainVerificationRow } from "./shared";

/**
 * The registration a verification decision was made about, as it was read:
 * the ref id alone does not say what was checked, its API server, domain
 * and token do (the token is random per registration).
 */
export type ApiServerDomainRegistrationIdentity = Pick<
  ApiServerDomainVerificationRow,
  "api_server_domain_ref_id" | "api_server_id" | "domain" | "verification_token"
>;

/**
 * @description Marks a domain registration verified (RFC 8707 resource URLs
 * on it resolve to its API server from now on), but only while it is still
 * the registration that was checked: same API server, domain and
 * verification token under its ref id. A verification decided on one
 * registration (a TXT lookup of its host, an administrator looking at its
 * domain) never lands on another one that replaced it meanwhile.
 *
 * It also only applies while the registration still needs it:
 * - `dns_txt`: pending, or attested by an administrator (now backed by DNS
 *   too). A registration DNS already verified keeps its original time.
 * - `administrator`: pending.
 *
 * @returns Whether the registration was updated. false: it was removed,
 * replaced or verified meanwhile; re-read it and decide again.
 */
export async function markApiServerDomainVerified(
  db: Kysely<AuthDatabase>,
  registration: ApiServerDomainRegistrationIdentity,
  verification_method: ApiServerDomainVerificationMethod,
  verified_at: number = Date.now(),
): Promise<boolean> {
  const result = await db
    .updateTable("api_server_domains")
    .set({ verified_at, verification_method })
    .where("api_server_domain_ref_id", "=", registration.api_server_domain_ref_id)
    .where("api_server_id", "=", registration.api_server_id)
    .where("domain", "=", registration.domain)
    .where("verification_token", "=", registration.verification_token)
    .where((eb) =>
      verification_method === "dns_txt"
        ? eb.or([eb("verified_at", "is", null), eb("verification_method", "!=", "dns_txt")])
        : eb("verified_at", "is", null),
    )
    .executeTakeFirst();
  return result.numUpdatedRows > BigInt(0);
}

/**
 * @description Returns DNS-verified registrations to pending, because the
 * TXT record that verified them is no longer published. Each is matched by
 * its ref id AND the verification token the lookup was judged against, so
 * a registration that replaced a checked one is left alone. Registrations a
 * platform administrator attested are left alone too.
 * @returns How many registrations were revoked
 */
export async function revokeDnsDomainVerifications(
  db: Kysely<AuthDatabase>,
  registrations: readonly Pick<
    ApiServerDomainRegistrationIdentity,
    "api_server_domain_ref_id" | "verification_token"
  >[],
): Promise<number> {
  if (registrations.length === 0) return 0;
  const result = await db
    .updateTable("api_server_domains")
    .set({ verified_at: null, verification_method: null })
    .where("verification_method", "=", "dns_txt")
    .where((eb) =>
      eb.or(
        registrations.map((registration) =>
          eb.and([
            eb("api_server_domain_ref_id", "=", registration.api_server_domain_ref_id),
            eb("verification_token", "=", registration.verification_token),
          ]),
        ),
      ),
    )
    .executeTakeFirst();
  return Number(result.numUpdatedRows);
}
