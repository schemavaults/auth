import { describe, expect, test } from "bun:test";
import {
  buildDomainVerificationTxtRecord,
  getDnsVerifiableHostname,
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

describe("buildDomainVerificationTxtRecord", () => {
  test("names an underscored record under the host and carries the token", () => {
    expect(buildDomainVerificationTxtRecord("api.example.com", TOKEN)).toEqual({
      name: "_auth-domain-verification.api.example.com",
      value: `auth-domain-verification=${TOKEN}`,
    });
  });

  test("getDomainVerificationTxtRecord is null for hosts DNS cannot verify", () => {
    expect(getDomainVerificationTxtRecord("http://localhost:3000", TOKEN)).toBeNull();
    expect(getDomainVerificationTxtRecord("https://api.example.com:8443", TOKEN)?.name).toBe(
      "_auth-domain-verification.api.example.com",
    );
  });
});

describe("isDomainVerificationValuePublished", () => {
  const expected = `auth-domain-verification=${TOKEN}`;

  test("finds the exact value among other records, ignoring surrounding whitespace", () => {
    expect(isDomainVerificationValuePublished(["v=spf1 -all", ` ${expected} `], expected)).toBe(true);
  });

  test("does not accept another token, a prefix of it, or an empty RRset", () => {
    expect(isDomainVerificationValuePublished([`auth-domain-verification=${"f".repeat(32)}`], expected)).toBe(false);
    expect(isDomainVerificationValuePublished([expected.slice(0, -1)], expected)).toBe(false);
    expect(isDomainVerificationValuePublished([`${expected}x`], expected)).toBe(false);
    expect(isDomainVerificationValuePublished([], expected)).toBe(false);
  });
});
