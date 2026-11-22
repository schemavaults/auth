import { describe, expect, test } from "bun:test";
import { DEFAULT_AUTH_SERVER_APP_ID, getAuthServerAppId } from "@schemavaults/app-definitions";
import {
  MAX_DOMAIN_VERIFICATION_APP_ID_LENGTH,
  buildDomainVerificationTxtRecord,
  getDnsVerifiableHostname,
  getDomainVerificationRecordPrefix,
  getDomainVerificationTxtRecord,
  isDomainVerificationValuePublished,
} from "./dns-txt-record";

const TOKEN = "0123456789abcdef0123456789abcdef";

describe("getDnsVerifiableHostname", () => {
  test("returns the lowercased host of an http(s) origin, whatever its port or path", () => {
    expect(getDnsVerifiableHostname("https://api.example.com")).toBe("api.example.com");
    expect(getDnsVerifiableHostname("https://API.Example.COM:8443/mcp")).toBe("api.example.com");
    expect(getDnsVerifiableHostname("http://api.example.com/")).toBe("api.example.com");
    expect(getDnsVerifiableHostname("https://api.example.com./")).toBe("api.example.com");
  });

  test("uses the punycode form of internationalized hosts", () => {
    expect(getDnsVerifiableHostname("https://bücher.example")).toBe("xn--bcher-kva.example");
  });

  test("refuses hosts DNS cannot verify", () => {
    for (const domain of [
      "http://localhost:3000",
      "http://app.localhost",
      "http://127.0.0.1:8080",
      "http://[::1]:8080",
      "https://10.0.0.1",
      "http://example-nextjs-resource-server/api",
      "ftp://files.example.com",
      "com.example.app:/callback",
      "not a url",
      "",
    ]) {
      expect(getDnsVerifiableHostname(domain)).toBeNull();
    }
  });

  test("refuses a host too long to name a TXT record under", () => {
    const label = "a".repeat(60);
    const host = `${label}.${label}.${label}.${label}.example`;
    expect(getDnsVerifiableHostname(`https://${host}`)).toBeNull();
  });
});

describe("getDomainVerificationRecordPrefix", () => {
  test("starts with the deployment's app id", () => {
    expect(getDomainVerificationRecordPrefix(DEFAULT_AUTH_SERVER_APP_ID)).toBe(
      "schemavaults-auth-domain-verification",
    );
    expect(getDomainVerificationRecordPrefix("acme-auth")).toBe("acme-auth-domain-verification");
    expect(getDomainVerificationRecordPrefix("acme_auth")).toBe("acme_auth-domain-verification");
    expect(getDomainVerificationRecordPrefix()).toBe(
      `${getAuthServerAppId()}-domain-verification`,
    );
  });

  test("shortens a long app id so the record name stays one DNS label", () => {
    const long_app_id = `${"a".repeat(MAX_DOMAIN_VERIFICATION_APP_ID_LENGTH - 1)}-${"b".repeat(20)}`;
    const prefix = getDomainVerificationRecordPrefix(long_app_id);
    expect(`_${prefix}`.length).toBeLessThanOrEqual(63);
    // Cut right after the hyphen, which is dropped too.
    expect(prefix).toBe(`${"a".repeat(MAX_DOMAIN_VERIFICATION_APP_ID_LENGTH - 1)}-domain-verification`);
    const longest = getDomainVerificationRecordPrefix("c".repeat(64));
    expect(`_${longest}`.length).toBe(63);
  });
});

describe("buildDomainVerificationTxtRecord", () => {
  test("names an underscored record under the host after the app id, and carries the token", () => {
    expect(buildDomainVerificationTxtRecord("api.example.com", TOKEN, "schemavaults-auth")).toEqual({
      name: "_schemavaults-auth-domain-verification.api.example.com",
      value: `schemavaults-auth-domain-verification=${TOKEN}`,
    });
    expect(buildDomainVerificationTxtRecord("api.example.com", TOKEN, "acme-auth")).toEqual({
      name: "_acme-auth-domain-verification.api.example.com",
      value: `acme-auth-domain-verification=${TOKEN}`,
    });
  });

  test("uses this deployment's app id by default", () => {
    expect(buildDomainVerificationTxtRecord("api.example.com", TOKEN)).toEqual(
      buildDomainVerificationTxtRecord("api.example.com", TOKEN, getAuthServerAppId()),
    );
  });

  test("getDomainVerificationTxtRecord is null for hosts DNS cannot verify", () => {
    expect(getDomainVerificationTxtRecord("http://localhost:3000", TOKEN)).toBeNull();
    expect(getDomainVerificationTxtRecord("https://api.example.com:8443", TOKEN, "acme-auth")?.name).toBe(
      "_acme-auth-domain-verification.api.example.com",
    );
  });
});

describe("isDomainVerificationValuePublished", () => {
  const expected = `acme-auth-domain-verification=${TOKEN}`;

  test("finds the exact value among other records, ignoring surrounding whitespace", () => {
    expect(isDomainVerificationValuePublished(["v=spf1 -all", ` ${expected} `], expected)).toBe(true);
  });

  test("does not accept another token, a prefix of it, or an empty RRset", () => {
    expect(isDomainVerificationValuePublished([`acme-auth-domain-verification=${"f".repeat(32)}`], expected)).toBe(false);
    // The same token published for another deployment does not count.
    expect(isDomainVerificationValuePublished([`schemavaults-auth-domain-verification=${TOKEN}`], expected)).toBe(false);
    expect(isDomainVerificationValuePublished([expected.slice(0, -1)], expected)).toBe(false);
    expect(isDomainVerificationValuePublished([`${expected}x`], expected)).toBe(false);
    expect(isDomainVerificationValuePublished([], expected)).toBe(false);
  });
});
