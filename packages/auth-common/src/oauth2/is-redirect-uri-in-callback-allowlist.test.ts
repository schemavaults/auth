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

describe("isRedirectUriInCallbackAllowlist loopback redirect URIs (RFC 8252 §7.3)", () => {
  const loopbackAllowlist = [
    "http://127.0.0.1/callback",
    "http://[::1]:9000/callback",
  ] as const;

  test("accepts any port for a registered IPv4 loopback URI", () => {
    expect(
      isRedirectUriInCallbackAllowlist(
        "http://127.0.0.1:53421/callback",
        loopbackAllowlist,
      ),
    ).toBe(true);
    expect(
      isRedirectUriInCallbackAllowlist(
        "http://127.0.0.1/callback",
        loopbackAllowlist,
      ),
    ).toBe(true);
  });

  test("accepts any port for a registered IPv6 loopback URI", () => {
    expect(
      isRedirectUriInCallbackAllowlist(
        "http://[::1]:1234/callback",
        loopbackAllowlist,
      ),
    ).toBe(true);
    expect(
      isRedirectUriInCallbackAllowlist(
        "http://[::1]/callback",
        loopbackAllowlist,
      ),
    ).toBe(true);
  });

  test("still requires the path and query to match on loopback", () => {
    expect(
      isRedirectUriInCallbackAllowlist(
        "http://127.0.0.1:53421/other",
        loopbackAllowlist,
      ),
    ).toBe(false);
    expect(
      isRedirectUriInCallbackAllowlist(
        "http://127.0.0.1:53421/callback/",
        loopbackAllowlist,
      ),
    ).toBe(false);
    expect(
      isRedirectUriInCallbackAllowlist(
        "http://127.0.0.1:53421/callback?next=https://attacker.example",
        loopbackAllowlist,
      ),
    ).toBe(false);
  });

  test("does not let a loopback registration match another loopback host", () => {
    expect(
      isRedirectUriInCallbackAllowlist(
        "http://localhost:53421/callback",
        loopbackAllowlist,
      ),
    ).toBe(false);
    expect(
      isRedirectUriInCallbackAllowlist(
        "http://127.0.0.2:53421/callback",
        loopbackAllowlist,
      ),
    ).toBe(false);
  });

  test("does not relax the port for a registered localhost URI", () => {
    const localhostAllowlist = ["http://localhost:3000/callback"] as const;
    expect(
      isRedirectUriInCallbackAllowlist(
        "http://localhost:3000/callback",
        localhostAllowlist,
      ),
    ).toBe(true);
    expect(
      isRedirectUriInCallbackAllowlist(
        "http://localhost:4000/callback",
        localhostAllowlist,
      ),
    ).toBe(false);
  });

  test("does not relax the port for a non-http loopback registration", () => {
    const httpsLoopback = ["https://127.0.0.1:8443/callback"] as const;
    expect(
      isRedirectUriInCallbackAllowlist(
        "https://127.0.0.1:8443/callback",
        httpsLoopback,
      ),
    ).toBe(true);
    expect(
      isRedirectUriInCallbackAllowlist(
        "https://127.0.0.1:9443/callback",
        httpsLoopback,
      ),
    ).toBe(false);
  });

  test("does not relax the port for a non-loopback registration", () => {
    const remote = ["http://app.example.com:8080/callback"] as const;
    expect(
      isRedirectUriInCallbackAllowlist(
        "http://app.example.com:9090/callback",
        remote,
      ),
    ).toBe(false);
  });

  test("a presented loopback URI never matches a non-loopback registration", () => {
    expect(
      isRedirectUriInCallbackAllowlist(
        "http://127.0.0.1:53421/auth/callback",
        ["https://app.example.com/auth/callback"],
      ),
    ).toBe(false);
  });
});
