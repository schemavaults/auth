import "server-only";

import type { ApiServerDomainVerification } from "@schemavaults/app-definitions";
import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import {
  getApiServerDomainVerificationRow,
  listDnsVerifiedDomainRowsOnHost,
  markApiServerDomainVerified,
  revokeDnsDomainVerifications,
  type ApiServerDomainVerificationRow,
} from "@/lib/auth-db/api-server-domain-verifications";
import { buildDomainVerificationTxtRecord, getDnsVerifiableHostname } from "./dns-txt-record";
import { lookupTxtRecords, type TxtLookupResult } from "./lookup-txt-records";
import { planDnsVerification } from "./plan-dns-verification";
import { toApiServerDomainVerification } from "./to-api-server-domain-verification";

export type VerifyApiServerDomainOutcome =
  /** The registration is verified (now, or it already was). */
  | { kind: "verified"; verification: ApiServerDomainVerification }
  /** The TXT lookup answered, without the registration's record. */
  | { kind: "record_not_found"; verification: ApiServerDomainVerification }
  /** The host cannot be verified through DNS (loopback, IP literal, ...). */
  | { kind: "not_dns_verifiable"; verification: ApiServerDomainVerification }
  /** No authoritative DNS answer; nothing changed. */
  | { kind: "lookup_failed"; code: string; verification: ApiServerDomainVerification }
  /** The API server has no domain with that ref id. */
  | { kind: "not_found" };

export interface VerifyApiServerDomainOptions {
  api_server_id: string;
  api_server_domain_ref_id: string;
  /**
   * `dns_txt` (default): look the registration's TXT record up.
   * `administrator`: a platform administrator attests the registration
   * (callers must have checked that the requester is one).
   */
  method?: "dns_txt" | "administrator";
  /** TXT lookup to use (tests inject one); the system resolver by default. */
  lookup?: (name: string) => Promise<TxtLookupResult>;
  now?: number;
}

async function reload(
  db: Kysely<AuthDatabase>,
  row: ApiServerDomainVerificationRow,
): Promise<ApiServerDomainVerification> {
  const current = await getApiServerDomainVerificationRow(
    db,
    row.api_server_id,
    row.api_server_domain_ref_id,
  );
  return toApiServerDomainVerification(current ?? row);
}

/**
 * @description Verifies that whoever registered a domain for an API server
 * controls it, so RFC 8707 resource URLs on the domain may resolve to the
 * API server.
 *
 * Through DNS, the registration's record (`_auth-domain-verification.<host>`
 * TXT `auth-domain-verification=<token>`) must be published. Every
 * authoritative answer also re-checks the host's other DNS verifications
 * and revokes those whose record is gone, the checked registration's own
 * included (see `planDnsVerification()`); a failed lookup changes nothing.
 */
export async function verifyApiServerDomain(
  db: Kysely<AuthDatabase>,
  {
    api_server_id,
    api_server_domain_ref_id,
    method = "dns_txt",
    lookup = (name: string) => lookupTxtRecords(name),
    now = Date.now(),
  }: VerifyApiServerDomainOptions,
): Promise<VerifyApiServerDomainOutcome> {
  const row = await getApiServerDomainVerificationRow(db, api_server_id, api_server_domain_ref_id);
  if (!row) return { kind: "not_found" };

  if (method === "administrator") {
    if (row.verified_at === null) {
      await markApiServerDomainVerified(db, row.api_server_domain_ref_id, "administrator", now);
    }
    return { kind: "verified", verification: await reload(db, row) };
  }

  const hostname: string | null = getDnsVerifiableHostname(row.domain);
  if (hostname === null) {
    return { kind: "not_dns_verifiable", verification: toApiServerDomainVerification(row) };
  }

  const record = buildDomainVerificationTxtRecord(hostname, row.verification_token);
  const answer: TxtLookupResult = await lookup(record.name);
  if (answer.kind === "lookup_failed") {
    return { kind: "lookup_failed", code: answer.code, verification: toApiServerDomainVerification(row) };
  }

  const others = await listDnsVerifiedDomainRowsOnHost(db, hostname);
  const plan = planDnsVerification({
    hostname,
    published_values: answer.kind === "records" ? answer.records : [],
    target: row,
    other_dns_verified: others,
  });

  await db.transaction().execute(async (trx) => {
    // A registration DNS already verified keeps its original time; one an
    // administrator attested is now backed by DNS too.
    if (plan.target_verified && row.verification_method !== "dns_txt") {
      await markApiServerDomainVerified(trx, row.api_server_domain_ref_id, "dns_txt", now);
    }
    await revokeDnsDomainVerifications(trx, plan.revoke_ref_ids);
  });

  const verification = await reload(db, row);
  return plan.target_verified
    ? { kind: "verified", verification }
    : { kind: "record_not_found", verification };
}

export default verifyApiServerDomain;
