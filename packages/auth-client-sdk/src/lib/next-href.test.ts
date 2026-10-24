import { describe, expect, test } from "bun:test";
import { resolveNextHref, withNextHref } from "./next-href";

describe("resolveNextHref", () => {
  test("accepts a same-origin path with its query and hash", () => {
    expect(resolveNextHref("/admin/keys")).toBe("/admin/keys");
    expect(resolveNextHref("/admin/email-send-log?status=failed#top")).toBe(
      "/admin/email-send-log?status=failed#top",
    );
  });

  test("rejects absent and non-string values", () => {
    expect(resolveNextHref(undefined)).toBeNull();
    expect(resolveNextHref(null)).toBeNull();
    expect(resolveNextHref("")).toBeNull();
    expect(resolveNextHref(42)).toBeNull();
  });

  test("rejects off-origin values (open redirects)", () => {
    expect(resolveNextHref("https://evil.example/phish")).toBeNull();
    expect(resolveNextHref("//evil.example")).toBeNull();
    expect(resolveNextHref("/\\evil.example")).toBeNull();
    expect(resolveNextHref("admin")).toBeNull();
  });

  test("rejects the sign-in flow's own pages", () => {
    expect(resolveNextHref("/auth")).toBeNull();
    expect(resolveNextHref("/auth/login")).toBeNull();
    expect(resolveNextHref("/auth/authorize?code=abc")).toBeNull();
    expect(resolveNextHref("/auth?x=1")).toBeNull();
    expect(resolveNextHref("/auth#x")).toBeNull();
  });

  test("keeps paths that merely start with 'auth'", () => {
    expect(resolveNextHref("/authors")).toBe("/authors");
    expect(resolveNextHref("/admin/auth/login")).toBe("/admin/auth/login");
  });
});

describe("withNextHref", () => {
  test("adds next_href to a bare path", () => {
    expect(withNextHref("/auth/login", "/admin/keys")).toBe(
      "/auth/login?next_href=%2Fadmin%2Fkeys",
    );
  });

  test("keeps existing search params and the hash", () => {
    expect(withNextHref("/auth/login?a=1#frag", "/admin?tab=x")).toBe(
      "/auth/login?a=1&next_href=%2Fadmin%3Ftab%3Dx#frag",
    );
  });

  test("replaces an existing next_href", () => {
    expect(withNextHref("/auth/login?next_href=%2Fold", "/new")).toBe(
      "/auth/login?next_href=%2Fnew",
    );
  });

  test("leaves the URL unchanged when next_href does not resolve", () => {
    expect(withNextHref("/auth/login", undefined)).toBe("/auth/login");
    expect(withNextHref("/auth/login", "https://evil.example")).toBe(
      "/auth/login",
    );
    expect(withNextHref("/auth/login", "/auth/logout")).toBe("/auth/login");
  });

  test("round-trips through URLSearchParams", () => {
    const url: string = withNextHref("/auth/login", "/a b/c?d=e&f=g");
    const parsed = new URL(url, "https://app.example");
    expect(parsed.searchParams.get("next_href")).toBe("/a%20b/c?d=e&f=g");
  });
});
