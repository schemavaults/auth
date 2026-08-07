import { describe, expect, test } from "bun:test";
import { sanitizeNextHref, MAX_NEXT_HREF_LENGTH } from "./sanitize-next-href";

describe("sanitizeNextHref", () => {
  test("accepts a simple internal path", () => {
    expect(sanitizeNextHref("/account")).toBe("/account");
  });

  test("accepts nested paths with query strings and hashes", () => {
    expect(sanitizeNextHref("/org/acme?tab=members#top")).toBe(
      "/org/acme?tab=members#top",
    );
    expect(sanitizeNextHref("/apis/my-api/jwks-access-keys")).toBe(
      "/apis/my-api/jwks-access-keys",
    );
  });

  test("accepts encoded characters in the path", () => {
    expect(sanitizeNextHref("/org/acme%20corp")).toBe("/org/acme%20corp");
  });

  test("rejects non-string values", () => {
    expect(sanitizeNextHref(undefined)).toBeNull();
    expect(sanitizeNextHref(null)).toBeNull();
    expect(sanitizeNextHref(42)).toBeNull();
    expect(sanitizeNextHref(["/account"])).toBeNull();
    expect(sanitizeNextHref({})).toBeNull();
  });

  test("rejects the empty string", () => {
    expect(sanitizeNextHref("")).toBeNull();
  });

  test("rejects absolute URLs", () => {
    expect(sanitizeNextHref("https://evil.example")).toBeNull();
    expect(sanitizeNextHref("http://evil.example/account")).toBeNull();
    expect(sanitizeNextHref("javascript:alert(1)")).toBeNull();
    expect(sanitizeNextHref("data:text/html,hi")).toBeNull();
  });

  test("rejects protocol-relative URLs", () => {
    expect(sanitizeNextHref("//evil.example")).toBeNull();
    expect(sanitizeNextHref("//evil.example/account")).toBeNull();
  });

  test("rejects backslash variants of protocol-relative URLs", () => {
    expect(sanitizeNextHref("/\\evil.example")).toBeNull();
    expect(sanitizeNextHref("\\/evil.example")).toBeNull();
    expect(sanitizeNextHref("\\\\evil.example")).toBeNull();
  });

  test("rejects relative (non-rooted) paths", () => {
    expect(sanitizeNextHref("account")).toBeNull();
    expect(sanitizeNextHref("../account")).toBeNull();
    expect(sanitizeNextHref("./account")).toBeNull();
  });

  test("rejects values with control characters", () => {
    expect(sanitizeNextHref("/account\r\nSet-Cookie: x=1")).toBeNull();
    expect(sanitizeNextHref("/account\tx")).toBeNull();
    expect(sanitizeNextHref("/account\u0000")).toBeNull();
  });

  test("rejects values exceeding the maximum length", () => {
    const long = "/" + "a".repeat(MAX_NEXT_HREF_LENGTH);
    expect(sanitizeNextHref(long)).toBeNull();
  });

  test("accepts values at the maximum length", () => {
    const max = "/" + "a".repeat(MAX_NEXT_HREF_LENGTH - 1);
    expect(sanitizeNextHref(max)).toBe(max);
  });

  test("normalizes dot segments so the result stays rooted", () => {
    expect(sanitizeNextHref("/a/../account")).toBe("/account");
    expect(sanitizeNextHref("/a/./b")).toBe("/a/b");
  });

  test("keeps the query string intact", () => {
    expect(sanitizeNextHref("/login-history?page=2&size=10")).toBe(
      "/login-history?page=2&size=10",
    );
  });
});
