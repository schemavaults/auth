import { describe, expect, test } from "bun:test";
import {
  DEFAULT_SERVICE_ACCOUNT_EMAIL_DOMAIN,
  isReservedServiceAccountEmail,
} from "./service-account-email-domain";
import { serviceAccountEmailDomainSchema } from "@/lib/auth-db/server-settings/server-setting-keys";

const RESERVED = [
  "service-accounts.auth.example.com",
  DEFAULT_SERVICE_ACCOUNT_EMAIL_DOMAIN,
] as const;

describe("isReservedServiceAccountEmail", () => {
  test("reserves the configured domain and the built-in default", () => {
    expect(
      isReservedServiceAccountEmail(
        "my-app@service-accounts.auth.example.com",
        RESERVED,
      ),
    ).toBeTrue();
    expect(
      isReservedServiceAccountEmail("my-app@service-accounts.invalid", RESERVED),
    ).toBeTrue();
  });

  test("compares the domain case-insensitively", () => {
    expect(
      isReservedServiceAccountEmail("Someone@Service-Accounts.INVALID", RESERVED),
    ).toBeTrue();
  });

  test("does not reserve other domains, subdomains, or look-alikes", () => {
    expect(
      isReservedServiceAccountEmail("person@example.com", RESERVED),
    ).toBeFalse();
    expect(
      isReservedServiceAccountEmail("person@auth.example.com", RESERVED),
    ).toBeFalse();
    expect(
      isReservedServiceAccountEmail(
        "person@sub.service-accounts.invalid",
        RESERVED,
      ),
    ).toBeFalse();
    expect(
      isReservedServiceAccountEmail("person@service-accounts.invalid.com", RESERVED),
    ).toBeFalse();
  });

  test("never reserves malformed input", () => {
    expect(isReservedServiceAccountEmail("service-accounts.invalid", RESERVED)).toBeFalse();
    expect(isReservedServiceAccountEmail("a@b@service-accounts.invalid", RESERVED)).toBeFalse();
    expect(isReservedServiceAccountEmail("person@", RESERVED)).toBeFalse();
  });
});

describe("serviceAccountEmailDomainSchema", () => {
  test("accepts bare hostnames and normalizes case/whitespace", () => {
    expect(serviceAccountEmailDomainSchema.parse(DEFAULT_SERVICE_ACCOUNT_EMAIL_DOMAIN)).toBe(
      DEFAULT_SERVICE_ACCOUNT_EMAIL_DOMAIN,
    );
    expect(
      serviceAccountEmailDomainSchema.parse("  Service-Accounts.Auth.Example.COM "),
    ).toBe("service-accounts.auth.example.com");
  });

  test("rejects anything that is not a bare hostname", () => {
    for (const bad of [
      "",
      "localhost",
      "https://service-accounts.example.com",
      "service-accounts.example.com/",
      "service-accounts.example.com:443",
      "svc@service-accounts.example.com",
      "-bad.example.com",
      "bad-.example.com",
      "example.c0m1234567890123456789012345678901234567890123456789012345678901234",
    ]) {
      expect(serviceAccountEmailDomainSchema.safeParse(bad).success, bad).toBeFalse();
    }
  });
});
