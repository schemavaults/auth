import { describe, expect, test } from "bun:test";
import { DEFAULT_AUTH_SERVER_APP_ID } from "@schemavaults/app-definitions";
import { parseOidcTokenResourceParam } from "./parse-oidc-token-resource-param";
import { form } from "./test-form";

const ENVIRONMENT = "test" as const;

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
