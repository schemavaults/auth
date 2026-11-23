import { describe, expect, test } from "bun:test";
import { ConflictError } from "@/lib/error/ConflictError";
import {
  API_SERVER_DOMAIN_REGISTRATION_OWNER,
  APP_DOMAIN_REGISTRATION_OWNER,
  assertDomainRegistrationAvailable,
  type DomainRegistration,
  domainRefIdInUseError,
  domainRefIdUsedError,
} from "./registration-conflicts";

const APEX: DomainRegistration = {
  ref_id: "6f1c1f4e-8a39-4c43-9b3e-2f0d6a1d6a10",
  domain: "https://example.com",
  environment: "production",
};

function conflictOf(fn: () => void): ConflictError {
  try {
    fn();
  } catch (e: unknown) {
    if (e instanceof ConflictError) return e;
    throw e;
  }
  throw new Error("Expected a ConflictError");
}

describe("assertDomainRegistrationAvailable", () => {
  test("accepts the www. subdomain of a registered apex domain, and the reverse", () => {
    const www: DomainRegistration = {
      ref_id: "0d2b4c1e-3f7a-4d0e-9b2a-7f3f2d1c8e5a",
      domain: "https://www.example.com",
      environment: "production",
    };
    expect(() =>
      assertDomainRegistrationAvailable(APP_DOMAIN_REGISTRATION_OWNER, [APEX], www),
    ).not.toThrow();
    expect(() =>
      assertDomainRegistrationAvailable(APP_DOMAIN_REGISTRATION_OWNER, [www], APEX),
    ).not.toThrow();
  });

  test("accepts the same domain in another environment", () => {
    expect(() =>
      assertDomainRegistrationAvailable(APP_DOMAIN_REGISTRATION_OWNER, [APEX], {
        ref_id: "9a1e2b3c-4d5e-4f60-8a7b-1c2d3e4f5a6b",
        domain: APEX.domain,
        environment: "staging",
      }),
    ).not.toThrow();
  });

  test("refuses a domain already registered in the environment, naming it", () => {
    const conflict = conflictOf(() =>
      assertDomainRegistrationAvailable(APP_DOMAIN_REGISTRATION_OWNER, [APEX], {
        ...APEX,
        ref_id: "9a1e2b3c-4d5e-4f60-8a7b-1c2d3e4f5a6b",
      }),
    );
    expect(conflict.message).toBe(
      '"https://example.com" is already registered for this app in the production environment.',
    );
  });

  test("reports a repeated registration (same id, same domain) as the domain being registered", () => {
    const conflict = conflictOf(() =>
      assertDomainRegistrationAvailable(API_SERVER_DOMAIN_REGISTRATION_OWNER, [APEX], APEX),
    );
    expect(conflict.message).toBe(
      '"https://example.com" is already registered for this API server in the production environment.',
    );
  });

  test("refuses another domain sent under an id already in use, saying the id is the problem", () => {
    const conflict = conflictOf(() =>
      assertDomainRegistrationAvailable(APP_DOMAIN_REGISTRATION_OWNER, [APEX], {
        ...APEX,
        domain: "https://www.example.com",
      }),
    );
    expect(conflict.message).toBe(domainRefIdInUseError(APP_DOMAIN_REGISTRATION_OWNER, APEX.ref_id).message);
    expect(conflict.message).toContain(`app_domain_ref_id "${APEX.ref_id}"`);
    expect(conflict.message).toContain("generate a new UUID");
  });

  test("names the API server's id field for API server domains", () => {
    expect(
      domainRefIdInUseError(API_SERVER_DOMAIN_REGISTRATION_OWNER, APEX.ref_id).message,
    ).toContain(`api_server_domain_ref_id "${APEX.ref_id}"`);
  });

  test("says that a used API server domain ref id stays used once its domain is removed", () => {
    const conflict = domainRefIdUsedError(API_SERVER_DOMAIN_REGISTRATION_OWNER, APEX.ref_id);
    expect(conflict).toBeInstanceOf(ConflictError);
    expect(conflict.message).toContain(`api_server_domain_ref_id "${APEX.ref_id}"`);
    expect(conflict.message).toContain("ids are never reused");
    expect(conflict.message).toContain("generate a new UUID");
  });
});
