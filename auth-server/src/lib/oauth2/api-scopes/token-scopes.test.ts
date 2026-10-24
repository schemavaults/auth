import { describe, expect, test } from "bun:test";
import {
  narrowGrantedScope,
  oidcPartOfGrantedScope,
  splitTokenScopes,
} from "./token-scopes";

const NOTES_API = "notes-api" as const;
const OTHER_API = "other-api" as const;
const NOTES_SCOPES: ReadonlySet<string> = new Set(["notes:read", "notes:write"]);
const NONE: ReadonlySet<string> = new Set();

describe("splitTokenScopes", () => {
  test("a grant without API scopes yields the same scope on both tokens", () => {
    for (const granted_scope of ["openid email profile", "", null, undefined]) {
      const result = splitTokenScopes({
        granted_scope,
        scope_api_server_id: null,
        defined_api_scopes: NONE,
        access_token_api_server_id: null,
      });
      expect(result.access_token_scope).toBe(granted_scope ?? "");
      expect(result.refresh_token_scope).toBe(granted_scope ?? "");
      expect(result.refresh_token_scope_api_server_id).toBeNull();
    }
  });

  test("API scopes go on an access token minted for their API server", () => {
    expect(
      splitTokenScopes({
        granted_scope: "openid notes:read email",
        scope_api_server_id: NOTES_API,
        defined_api_scopes: NOTES_SCOPES,
        access_token_api_server_id: NOTES_API,
      }),
    ).toEqual({
      access_token_scope: "openid notes:read email",
      refresh_token_scope: "openid notes:read email",
      refresh_token_scope_api_server_id: NOTES_API,
    });
  });

  test("API scopes stay off access tokens for another audience but stay on the refresh token", () => {
    for (const access_token_api_server_id of [OTHER_API, null]) {
      expect(
        splitTokenScopes({
          granted_scope: "openid notes:read",
          scope_api_server_id: NOTES_API,
          defined_api_scopes: NOTES_SCOPES,
          access_token_api_server_id,
        }),
      ).toEqual({
        access_token_scope: "openid",
        refresh_token_scope: "openid notes:read",
        refresh_token_scope_api_server_id: NOTES_API,
      });
    }
  });

  test("API scopes the API server no longer defines drop off", () => {
    expect(
      splitTokenScopes({
        granted_scope: "openid notes:read notes:deleted",
        scope_api_server_id: NOTES_API,
        defined_api_scopes: NOTES_SCOPES,
        access_token_api_server_id: NOTES_API,
      }),
    ).toEqual({
      access_token_scope: "openid notes:read",
      refresh_token_scope: "openid notes:read",
      refresh_token_scope_api_server_id: NOTES_API,
    });
    // ...and the binding goes once none is left.
    expect(
      splitTokenScopes({
        granted_scope: "openid notes:deleted",
        scope_api_server_id: NOTES_API,
        defined_api_scopes: NOTES_SCOPES,
        access_token_api_server_id: NOTES_API,
      }).refresh_token_scope_api_server_id,
    ).toBeNull();
  });

  test("without a binding, non-OIDC values are never granted", () => {
    expect(
      splitTokenScopes({
        granted_scope: "openid notes:read",
        scope_api_server_id: null,
        defined_api_scopes: NOTES_SCOPES,
        access_token_api_server_id: NOTES_API,
      }),
    ).toEqual({
      access_token_scope: "openid",
      refresh_token_scope: "openid",
      refresh_token_scope_api_server_id: null,
    });
  });
});

describe("narrowGrantedScope", () => {
  test("narrows to a subset, keeping the request order", () => {
    expect(
      narrowGrantedScope("openid email notes:read notes:write", "notes:write openid", NOTES_SCOPES),
    ).toEqual({ ok: true, scope: "notes:write openid" });
  });

  test("drops unknown values, as before API scopes existed", () => {
    expect(
      narrowGrantedScope("openid email profile", "openid email mcp:tools address", NONE),
    ).toEqual({ ok: true, scope: "openid email" });
  });

  test("refuses a grantable scope that was not originally granted", () => {
    expect(narrowGrantedScope("email", "openid email", NONE)).toEqual({
      ok: false,
      reason: "exceeds_grant",
    });
    expect(
      narrowGrantedScope("openid notes:read", "openid notes:write", NOTES_SCOPES),
    ).toEqual({ ok: false, reason: "exceeds_grant" });
  });

  test("refuses a malformed value", () => {
    expect(narrowGrantedScope("openid", "openid  email", NONE)).toEqual({
      ok: false,
      reason: "malformed",
    });
  });
});

describe("oidcPartOfGrantedScope", () => {
  test("keeps the OIDC scopes only", () => {
    expect(oidcPartOfGrantedScope("openid notes:read email")).toBe("openid email");
    expect(oidcPartOfGrantedScope("notes:read")).toBeNull();
    expect(oidcPartOfGrantedScope(null)).toBeNull();
  });
});
