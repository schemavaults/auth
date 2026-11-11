import { describe, expect, test } from "bun:test";
import { DEFAULT_AUTH_SCOPE, defineScope, oidcScopes } from "@schemavaults/auth-common";
import {
  UNRECORDED_SIGN_IN_AUTHORIZATION_REQUEST,
  isSignInAuthorizationRequestCovered,
  parseAuthorizationParams,
  parseSignInAuthorizationRequest,
  resolveSignInAuthorizationRequest,
} from "./authorization-params";

describe("parseAuthorizationParams()", () => {
  test("accepts an absent option", () => {
    expect(parseAuthorizationParams(undefined)).toBeUndefined();
    expect(parseAuthorizationParams(null)).toBeUndefined();
  });

  test("normalizes the scope and keeps the resource", () => {
    expect(
      parseAuthorizationParams({
        scope: "  openid email\tnotes:read  notes:read ",
        resource: "my-notes-api",
      }),
    ).toEqual({ scope: "openid email notes:read", resource: "my-notes-api" });
  });

  test("takes the scope as a list of values and definitions", () => {
    const notesRead = defineScope({ scope: "notes:read", description: "Read your notes" });
    expect(
      parseAuthorizationParams({
        scope: [oidcScopes.openid, "email", notesRead, notesRead],
        resource: "my-notes-api",
      }),
    ).toEqual({ scope: "openid email notes:read", resource: "my-notes-api" });
    expect(() => parseAuthorizationParams({ scope: [oidcScopes.openid, notesRead] })).toThrow(
      /notes:read.*no 'resource'/,
    );
  });

  test("accepts OIDC scopes without a resource, and a resource alone", () => {
    expect(parseAuthorizationParams({ scope: "openid email" })).toEqual({
      scope: "openid email",
    });
    expect(parseAuthorizationParams({ resource: "my-notes-api" })).toEqual({
      resource: "my-notes-api",
    });
  });

  test("refuses API scopes without the resource they belong to", () => {
    expect(() =>
      parseAuthorizationParams({ scope: "openid notes:read" }),
    ).toThrow(/notes:read.*no 'resource'/);
  });

  test("refuses malformed values", () => {
    for (const value of [
      "openid",
      ["openid"],
      { scope: 42 },
      { scope: [] },
      { scope: [42] },
      { scope: [{ scope: "openid" }] },
      { scope: [{ scope: "notes read", description: "Read your notes" }] },
      { scope: "" },
      { scope: "   " },
      { scope: 'openid "quoted"' },
      { resource: "" },
      { resource: " my-notes-api" },
      { resource: 7 },
    ]) {
      expect(() => parseAuthorizationParams(value)).toThrow(TypeError);
    }
  });
});

describe("resolveSignInAuthorizationRequest()", () => {
  const defaults = { scope: "openid email notes:read", resource: "my-notes-api" };

  test("uses the defaults when the call names nothing", () => {
    expect(resolveSignInAuthorizationRequest(undefined, defaults)).toEqual({
      scope: "openid email notes:read",
      resource: "my-notes-api",
    });
    expect(resolveSignInAuthorizationRequest({}, defaults)).toEqual({
      scope: "openid email notes:read",
      resource: "my-notes-api",
    });
  });

  test("lets the call override each parameter on its own", () => {
    expect(
      resolveSignInAuthorizationRequest({ scope: "openid notes:write" }, defaults),
    ).toEqual({ scope: "openid notes:write", resource: "my-notes-api" });
    expect(
      resolveSignInAuthorizationRequest(
        { scope: "openid billing:read", resource: "billing-api" },
        defaults,
      ),
    ).toEqual({ scope: "openid billing:read", resource: "billing-api" });
  });

  test("formats a scope given as definitions", () => {
    expect(
      resolveSignInAuthorizationRequest({ scope: [oidcScopes.openid, oidcScopes.profile] }, defaults),
    ).toEqual({ scope: "openid profile", resource: "my-notes-api" });
  });

  test("falls back to the default scope and no resource", () => {
    expect(resolveSignInAuthorizationRequest(undefined, undefined)).toEqual({
      scope: DEFAULT_AUTH_SCOPE,
      resource: null,
    });
    expect(resolveSignInAuthorizationRequest({ resource: "" }, undefined)).toEqual({
      scope: DEFAULT_AUTH_SCOPE,
      resource: null,
    });
  });
});

describe("isSignInAuthorizationRequestCovered()", () => {
  const wanted = { scope: "openid email notes:read notes:write", resource: "my-notes-api" };

  test("a sign-in that asked for the same scopes (in any order) or more covers it", () => {
    expect(isSignInAuthorizationRequestCovered(wanted, wanted)).toBe(true);
    expect(
      isSignInAuthorizationRequestCovered(
        { scope: "notes:write openid notes:read email profile", resource: "my-notes-api" },
        wanted,
      ),
    ).toBe(true);
  });

  test("a sign-in that asked for fewer scopes does not", () => {
    expect(
      isSignInAuthorizationRequestCovered(
        { scope: "openid email notes:read", resource: "my-notes-api" },
        wanted,
      ),
    ).toBe(false);
  });

  test("API scopes asked of another resource (or of none) do not count", () => {
    expect(
      isSignInAuthorizationRequestCovered({ ...wanted, resource: "other-api" }, wanted),
    ).toBe(false);
    expect(isSignInAuthorizationRequestCovered({ ...wanted, resource: null }, wanted)).toBe(
      false,
    );
  });

  test("the resource does not matter when only OIDC scopes are wanted", () => {
    expect(
      isSignInAuthorizationRequestCovered(
        { scope: "openid email profile", resource: "my-notes-api" },
        { scope: "openid email", resource: null },
      ),
    ).toBe(true);
  });

  test("an unrecorded sign-in asked for the default scope only", () => {
    expect(
      isSignInAuthorizationRequestCovered(UNRECORDED_SIGN_IN_AUTHORIZATION_REQUEST, {
        scope: DEFAULT_AUTH_SCOPE,
        resource: null,
      }),
    ).toBe(true);
    expect(
      isSignInAuthorizationRequestCovered(UNRECORDED_SIGN_IN_AUTHORIZATION_REQUEST, wanted),
    ).toBe(false);
  });
});

describe("parseSignInAuthorizationRequest()", () => {
  test("reads stored requests", () => {
    expect(parseSignInAuthorizationRequest({ scope: "openid", resource: null })).toEqual({
      scope: "openid",
      resource: null,
    });
    expect(
      parseSignInAuthorizationRequest({ scope: "openid notes:read", resource: "my-notes-api" }),
    ).toEqual({ scope: "openid notes:read", resource: "my-notes-api" });
  });

  test("refuses anything else", () => {
    for (const value of [null, "openid", [], { scope: 1 }, { scope: "openid", resource: 2 }]) {
      expect(parseSignInAuthorizationRequest(value)).toBeNull();
    }
  });
});
