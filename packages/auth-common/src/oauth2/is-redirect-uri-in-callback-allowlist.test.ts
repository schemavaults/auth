import { describe, expect, test } from "bun:test";
import { isRedirectUriInCallbackAllowlist } from "./is-redirect-uri-in-callback-allowlist";

describe("isRedirectUriInCallbackAllowlist", () => {
  const allowlist = [
    "https://app.example.com/auth/callback",
    "https://app.example.com/other/callback",
  ] as const;

  test("accepts an exact match", () => {
    expect(
      isRedirectUriInCallbackAllowlist(
        "https://app.example.com/auth/callback",
        allowlist,
      ),
    ).toBe(true);
  });

  test("rejects a different path on an allowed origin", () => {
    expect(
      isRedirectUriInCallbackAllowlist(
        "https://app.example.com/evil/path",
        allowlist,
      ),
    ).toBe(false);
  });

  test("rejects a path-prefix extension of an allowed URL", () => {
    expect(
      isRedirectUriInCallbackAllowlist(
        "https://app.example.com/auth/callback/extra",
        allowlist,
      ),
    ).toBe(false);
  });

  test("rejects a trailing-slash variant of an allowed path", () => {
    expect(
      isRedirectUriInCallbackAllowlist(
        "https://app.example.com/auth/callback/",
        allowlist,
      ),
    ).toBe(false);
  });

  test("rejects an allowed path on a different origin", () => {
    expect(
      isRedirectUriInCallbackAllowlist(
        "https://attacker.example/auth/callback",
        allowlist,
      ),
    ).toBe(false);
  });

  test("rejects added query parameters", () => {
    expect(
      isRedirectUriInCallbackAllowlist(
        "https://app.example.com/auth/callback?next=https://attacker.example",
        allowlist,
      ),
    ).toBe(false);
  });

  test("requires registered query parameters to match exactly", () => {
    const withQuery = ["https://app.example.com/cb?tenant=a"] as const;
    expect(
      isRedirectUriInCallbackAllowlist(
        "https://app.example.com/cb?tenant=a",
        withQuery,
      ),
    ).toBe(true);
    expect(
      isRedirectUriInCallbackAllowlist(
        "https://app.example.com/cb?tenant=b",
        withQuery,
      ),
    ).toBe(false);
  });

  test("normalizes default ports and host casing", () => {
    expect(
      isRedirectUriInCallbackAllowlist(
        "https://App.Example.com:443/auth/callback",
        allowlist,
      ),
    ).toBe(true);
  });

  test("does not treat a bare-origin registration as an origin wildcard", () => {
    const bareOrigin = ["https://app.example.com"] as const;
    expect(
      isRedirectUriInCallbackAllowlist("https://app.example.com", bareOrigin),
    ).toBe(true);
    expect(
      isRedirectUriInCallbackAllowlist("https://app.example.com/", bareOrigin),
    ).toBe(true);
    expect(
      isRedirectUriInCallbackAllowlist(
        "https://app.example.com/any/path",
        bareOrigin,
      ),
    ).toBe(false);
  });

  test("rejects malformed and empty values", () => {
    expect(isRedirectUriInCallbackAllowlist("", allowlist)).toBe(false);
    expect(isRedirectUriInCallbackAllowlist("not-a-url", allowlist)).toBe(
      false,
    );
    expect(
      isRedirectUriInCallbackAllowlist("https://app.example.com/cb", []),
    ).toBe(false);
  });
});
