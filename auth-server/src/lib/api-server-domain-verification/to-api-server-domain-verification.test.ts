import { describe, expect, test } from "bun:test";
import { apiServerDomainVerificationSchema, getAuthServerAppId } from "@schemavaults/app-definitions";
import { toApiServerDomainVerification } from "./to-api-server-domain-verification";

const REF = "6f1c1f4e-8a39-4c43-9b3e-2f0d6a1d6a10";
const TOKEN = "0123456789abcdef0123456789abcdef";

describe("toApiServerDomainVerification", () => {
  test("reports a pending registration with the TXT record to publish", () => {
    const verification = toApiServerDomainVerification({
      api_server_domain_ref_id: REF,
      domain: "https://api.example.com",
      verification_token: TOKEN,
      verified_at: null,
      verification_method: null,
    });
    expect(verification).toEqual({
      api_server_domain_ref_id: REF,
      verified: false,
      verified_at: null,
      verification_method: null,
      dns_txt_record: {
        name: `_${getAuthServerAppId()}-domain-verification.api.example.com`,
        value: `${getAuthServerAppId()}-domain-verification=${TOKEN}`,
      },
    });
    expect(apiServerDomainVerificationSchema.parse(verification)).toEqual(verification);
  });

  test("reports a verified registration, and no TXT record for hosts DNS cannot verify", () => {
    const verification = toApiServerDomainVerification({
      api_server_domain_ref_id: REF,
      domain: "http://localhost:3000",
      verification_token: TOKEN,
      verified_at: 1_700_000_000_000,
      verification_method: "administrator",
    });
    expect(verification).toEqual({
      api_server_domain_ref_id: REF,
      verified: true,
      verified_at: 1_700_000_000_000,
      verification_method: "administrator",
      dns_txt_record: null,
    });
    expect(apiServerDomainVerificationSchema.parse(verification)).toEqual(verification);
  });

  test("never reports a half-set row as verified", () => {
    const verification = toApiServerDomainVerification({
      api_server_domain_ref_id: REF,
      domain: "https://api.example.com",
      verification_token: TOKEN,
      verified_at: 1_700_000_000_000,
      verification_method: null,
    });
    expect(verification.verified).toBe(false);
    expect(verification.verified_at).toBeNull();
  });
});
