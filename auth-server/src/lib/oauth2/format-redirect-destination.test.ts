import { describe, expect, test } from "bun:test";
import { formatRedirectDestination } from "./format-redirect-destination";

describe("formatRedirectDestination", () => {
  test("renders the host of an https redirect_uri without path or query", () => {
    expect(
      formatRedirectDestination(
        "https://app.example.com/auth/callback?state=abc#frag",
      ),
    ).toBe("app.example.com");
  });

  test("keeps a non-default port and drops a default one", () => {
    expect(formatRedirectDestination("http://localhost:3007/callback")).toBe(
      "localhost:3007",
    );
    expect(formatRedirectDestination("https://app.example.com:443/cb")).toBe(
      "app.example.com",
    );
    expect(formatRedirectDestination("http://app.example.com:80/cb")).toBe(
      "app.example.com",
    );
  });

  test("lowercases the host so lookalike casing cannot be used to confuse", () => {
    expect(formatRedirectDestination("https://App.Example.COM/cb")).toBe(
      "app.example.com",
    );
  });

  test("ignores userinfo in the authority", () => {
    expect(
      formatRedirectDestination("https://trusted.example.com@evil.example/cb"),
    ).toBe("evil.example");
  });

  test("keeps the scheme for non-http(s) native-app redirect URIs", () => {
    expect(formatRedirectDestination("myapp://callback/path")).toBe(
      "myapp://callback",
    );
  });

  test("returns null for absent, empty, unparsable, or host-less values", () => {
    expect(formatRedirectDestination(null)).toBeNull();
    expect(formatRedirectDestination(undefined)).toBeNull();
    expect(formatRedirectDestination("")).toBeNull();
    expect(formatRedirectDestination("not a url")).toBeNull();
    expect(formatRedirectDestination("/relative/path")).toBeNull();
    expect(formatRedirectDestination("mailto:someone@example.com")).toBeNull();
  });
});
