import type { ApiServerDomainVerification } from "@schemavaults/app-definitions";
import type { ApiServerDomainVerificationRow } from "@/lib/auth-db/api-server-domain-verifications/shared";
import { getDomainVerificationTxtRecord } from "./dns-txt-record";

/**
 * @description The wire form of a registration's verification state: whether
 * it is verified, how and when, and the TXT record that verifies it through
 * DNS (null for hosts DNS cannot verify).
 */
export function toApiServerDomainVerification(
  row: Pick<
    ApiServerDomainVerificationRow,
    "api_server_domain_ref_id" | "domain" | "verification_token" | "verified_at" | "verification_method"
  >,
): ApiServerDomainVerification {
  const verified: boolean = row.verified_at !== null && row.verification_method !== null;
  return {
    api_server_domain_ref_id: row.api_server_domain_ref_id,
    verified,
    verified_at: verified ? row.verified_at : null,
    verification_method: verified ? row.verification_method : null,
    dns_txt_record: getDomainVerificationTxtRecord(row.domain, row.verification_token),
  };
}

export default toApiServerDomainVerification;
