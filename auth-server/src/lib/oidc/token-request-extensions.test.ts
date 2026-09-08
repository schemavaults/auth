import { describe, expect, test } from "bun:test";
import { DEFAULT_AUTH_SERVER_APP_ID } from "@schemavaults/app-definitions";
import {
  parseOidcRefreshTokenDeliveryParam,
  parseOidcTokenResourceParam,
  resolveRefreshTokenDeliveryMode,
} from "./token-request-extensions";

const ENVIRONMENT = "test" as const;

function form(entries: [string, string][]): FormData {
  const fd = new FormData();
  for (const [k, v] of entries) fd.append(k, v);
  return fd;
}

describe("parseOidcTokenResourceParam", () => {
  test("absent resource means the plain OIDC (userinfo audience) behavior", () => {
    expect(parseOidcTokenResourceParam(form([]), ENVIRONMENT)).toEqual({
      ok: true,
      resource: null,
    });
    // Empty values are treated as absent, like every other form param.
    expect(
      parseOidcTokenResourceParam(form([["resource", ""]]), ENVIRONMENT),
    ).toEqual({ ok: true, resource: null });
  });

  test("accepts the auth server URL and API server ids", () => {
    expect(
      parseOidcTokenResourceParam(
        form([["resource", "http://schemavaults-auth"]]),
        ENVIRONMENT,
      ),
    ).toEqual({ ok: true, resource: "http://schemavaults-auth" });
    expect(
      parseOidcTokenResourceParam(
        form([["resource", "my-api-server"]]),
        ENVIRONMENT,
      ),
    ).toEqual({ ok: true, resource: "my-api-server" });
  });

  test("rejects the bare auth app id and malformed values with invalid_target", () => {
    for (const bad of [DEFAULT_AUTH_SERVER_APP_ID, "not a resource!", "https://elsewhere.example"]) {
      const parsed = parseOidcTokenResourceParam(
        form([["resource", bad]]),
        ENVIRONMENT,
      );
      expect(parsed.ok).toBe(false);
      if (!parsed.ok) {
        expect(parsed.error.error).toBe("invalid_target");
      }
    }
  });

  test("rejects multiple resources with invalid_target", () => {
    const parsed = parseOidcTokenResourceParam(
      form([
        ["resource", "my-api-server"],
        ["resource", "other-api-server"],
      ]),
      ENVIRONMENT,
    );
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.error.error).toBe("invalid_target");
      expect(parsed.error.error_description).toContain("single 'resource'");
    }
  });
});

describe("parseOidcRefreshTokenDeliveryParam", () => {
  test("defaults to inline", () => {
    expect(parseOidcRefreshTokenDeliveryParam(form([]))).toEqual({
      ok: true,
      mode: "inline",
    });
  });
  test("accepts the cookie mode", () => {
    expect(
      parseOidcRefreshTokenDeliveryParam(
        form([["refresh_token_delivery", "http_only_cookie"]]),
      ),
    ).toEqual({ ok: true, mode: "http_only_cookie" });
  });
  test("rejects unknown modes with invalid_request", () => {
    const parsed = parseOidcRefreshTokenDeliveryParam(
      form([["refresh_token_delivery", "cookie"]]),
    );
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error.error).toBe("invalid_request");
  });
});

describe("resolveRefreshTokenDeliveryMode", () => {
  test("the auth server's own app always gets the cookie", () => {
    expect(
      resolveRefreshTokenDeliveryMode(DEFAULT_AUTH_SERVER_APP_ID, "inline", false),
    ).toBe("http_only_cookie");
    expect(
      resolveRefreshTokenDeliveryMode(DEFAULT_AUTH_SERVER_APP_ID, "inline", true),
    ).toBe("http_only_cookie");
  });
  test("other apps get the cookie only when requested in a secure deployment", () => {
    expect(resolveRefreshTokenDeliveryMode("my-app", "http_only_cookie", true)).toBe(
      "http_only_cookie",
    );
    expect(resolveRefreshTokenDeliveryMode("my-app", "http_only_cookie", false)).toBe(
      "inline",
    );
    expect(resolveRefreshTokenDeliveryMode("my-app", "inline", true)).toBe("inline");
  });
});
