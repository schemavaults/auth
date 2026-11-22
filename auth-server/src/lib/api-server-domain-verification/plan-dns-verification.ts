import type { ApiServerDomainVerificationMethod } from "@schemavaults/app-definitions";
import {
  buildDomainVerificationTxtRecord,
  isDomainVerificationValuePublished,
} from "./dns-txt-record";

/** What a DNS check needs to know about one registration. */
export interface DnsVerificationCandidate {
  api_server_domain_ref_id: string;
  verification_token: string;
  verification_method: ApiServerDomainVerificationMethod | null;
}

export interface DnsVerificationPlan {
  /** Whether the checked registration's record is published. */
  target_verified: boolean;
  /**
   * DNS-verified registrations (the checked one included) whose record is
   * no longer published: they return to pending.
   */
  revoke_ref_ids: string[];
}

/**
 * @description Decides the outcome of an authoritative TXT lookup of a
 * host's verification name. The checked registration is verified when its
 * record is published. Every other registration of the same host that DNS
 * verified earlier (any API server, any environment) was proven by a record
 * under that same name, so the same answer re-checks them: those whose
 * record is gone are revoked. That is how a domain's new owner takes it over
 * from a previous owner's stale verification (publishing their own record
 * and dropping the old one), and why a host's owner keeps the records of
 * every registration they want verified published. Registrations a platform
 * administrator attested are never revoked by DNS.
 *
 * @param published_values The host's TXT values; empty when the name does
 * not exist or has no TXT records.
 */
export function planDnsVerification({
  hostname,
  published_values,
  target,
  other_dns_verified,
}: {
  hostname: string;
  published_values: readonly string[];
  target: DnsVerificationCandidate;
  other_dns_verified: readonly DnsVerificationCandidate[];
}): DnsVerificationPlan {
  const isPublished = (candidate: DnsVerificationCandidate): boolean =>
    isDomainVerificationValuePublished(
      published_values,
      buildDomainVerificationTxtRecord(hostname, candidate.verification_token).value,
    );

  const target_verified: boolean = isPublished(target);
  const revoke_ref_ids: string[] = [];
  if (!target_verified && target.verification_method === "dns_txt") {
    revoke_ref_ids.push(target.api_server_domain_ref_id);
  }
  for (const other of other_dns_verified) {
    if (other.api_server_domain_ref_id === target.api_server_domain_ref_id) continue;
    if (other.verification_method !== "dns_txt") continue;
    if (!isPublished(other)) {
      revoke_ref_ids.push(other.api_server_domain_ref_id);
    }
  }
  return { target_verified, revoke_ref_ids };
}

export default planDnsVerification;
