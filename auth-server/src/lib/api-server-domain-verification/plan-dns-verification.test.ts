import { describe, expect, test } from "bun:test";
import { buildDomainVerificationTxtRecord } from "./dns-txt-record";
import { planDnsVerification, type DnsVerificationCandidate } from "./plan-dns-verification";

const HOST = "api.example.com";

function candidate(
  ref: string,
  verification_method: DnsVerificationCandidate["verification_method"] = null,
): DnsVerificationCandidate {
  return {
    api_server_domain_ref_id: ref,
    verification_token: `token-${ref}`,
    verification_method,
  };
}

function published(...candidates: DnsVerificationCandidate[]): string[] {
  return candidates.map((c) => buildDomainVerificationTxtRecord(HOST, c.verification_token).value);
}

describe("planDnsVerification", () => {
  test("verifies the registration whose record is published", () => {
    const target = candidate("target");
    expect(
      planDnsVerification({
        hostname: HOST,
        published_values: ["v=spf1 -all", ...published(target)],
        target,
        other_dns_verified: [],
      }),
    ).toEqual({ target_verified: true, revoke_ref_ids: [] });
  });

  test("a squatter's check neither verifies them nor disturbs the owner's verification", () => {
    const owner = candidate("owner", "dns_txt");
    const squatter = candidate("squatter");
    expect(
      planDnsVerification({
        hostname: HOST,
        published_values: published(owner),
        target: squatter,
        other_dns_verified: [owner],
      }),
    ).toEqual({ target_verified: false, revoke_ref_ids: [] });
  });

  test("a new owner's record revokes a previous owner's stale DNS verification", () => {
    const previous = candidate("previous", "dns_txt");
    const current = candidate("current");
    expect(
      planDnsVerification({
        hostname: HOST,
        published_values: published(current),
        target: current,
        other_dns_verified: [previous],
      }),
    ).toEqual({ target_verified: true, revoke_ref_ids: ["previous"] });
  });

  test("registrations whose records are all published stay verified together", () => {
    const a = candidate("a", "dns_txt");
    const b = candidate("b");
    expect(
      planDnsVerification({
        hostname: HOST,
        published_values: published(a, b),
        target: b,
        other_dns_verified: [a],
      }),
    ).toEqual({ target_verified: true, revoke_ref_ids: [] });
  });

  test("re-checking a DNS-verified registration whose record was removed revokes it", () => {
    const target = candidate("target", "dns_txt");
    expect(
      planDnsVerification({ hostname: HOST, published_values: [], target, other_dns_verified: [] }),
    ).toEqual({ target_verified: false, revoke_ref_ids: ["target"] });
  });

  test("never revokes what a platform administrator attested", () => {
    const attested = candidate("attested", "administrator");
    expect(
      planDnsVerification({
        hostname: HOST,
        published_values: [],
        target: attested,
        other_dns_verified: [candidate("also-attested", "administrator")],
      }),
    ).toEqual({ target_verified: false, revoke_ref_ids: [] });
  });

  test("ignores the target if it is listed among the others", () => {
    const target = candidate("target", "dns_txt");
    expect(
      planDnsVerification({
        hostname: HOST,
        published_values: published(target),
        target,
        other_dns_verified: [target],
      }),
    ).toEqual({ target_verified: true, revoke_ref_ids: [] });
  });
});
