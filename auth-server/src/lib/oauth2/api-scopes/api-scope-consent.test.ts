import { describe, expect, test } from "bun:test";
import { decideApiScopeConsent, isConsentScreenRequired } from "./api-scope-consent";

describe("decideApiScopeConsent", () => {
  test("grants only the consented scopes and leaves the rest pending", () => {
    expect(
      decideApiScopeConsent({
        requested_api_scopes: ["notes:read", "notes:write", "notes:admin"],
        consented_api_scopes: ["notes:admin", "notes:read", "other:read"],
        first_party: false,
      }),
    ).toEqual({
      granted_api_scopes: ["notes:read", "notes:admin"],
      pending_api_scopes: ["notes:write"],
      implicit_consent: false,
    });
  });

  test("grants every requested scope through a first-party connection, with nothing consented", () => {
    expect(
      decideApiScopeConsent({
        requested_api_scopes: ["notes:read", "notes:write"],
        consented_api_scopes: [],
        first_party: true,
      }),
    ).toEqual({
      granted_api_scopes: ["notes:read", "notes:write"],
      pending_api_scopes: [],
      implicit_consent: true,
    });
  });

  test("is not implicit when the request asks for no API scope, even through a first-party connection", () => {
    expect(
      decideApiScopeConsent({
        requested_api_scopes: [],
        consented_api_scopes: ["notes:read"],
        first_party: true,
      }),
    ).toEqual({ granted_api_scopes: [], pending_api_scopes: [], implicit_consent: false });
  });

  test("never grants a scope that was not requested", () => {
    const decision = decideApiScopeConsent({
      requested_api_scopes: ["notes:read"],
      consented_api_scopes: ["notes:read", "notes:write"],
      first_party: true,
    });
    expect(decision.granted_api_scopes).toEqual(["notes:read"]);
  });
});

describe("isConsentScreenRequired", () => {
  const base = {
    is_auth_server_app: false,
    implicit_consent: false,
    authorized: true,
    pending_api_scope_count: 0,
  };

  test("is required for an app the user never authorized", () => {
    expect(isConsentScreenRequired({ ...base, authorized: false })).toBe(true);
  });

  test("is required while API scopes are pending", () => {
    expect(isConsentScreenRequired({ ...base, pending_api_scope_count: 1 })).toBe(true);
  });

  test("is not required for an authorized app with nothing pending", () => {
    expect(isConsentScreenRequired(base)).toBe(false);
  });

  test("is never required for the auth server's own app", () => {
    expect(
      isConsentScreenRequired({ ...base, is_auth_server_app: true, authorized: false, pending_api_scope_count: 2 }),
    ).toBe(false);
  });

  test("is not required when consent is implicit (first-party connection), even before the app is authorized", () => {
    expect(isConsentScreenRequired({ ...base, implicit_consent: true, authorized: false })).toBe(false);
  });
});
