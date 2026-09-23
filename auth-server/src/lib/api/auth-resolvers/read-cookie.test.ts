import { describe, expect, test } from "bun:test";
import { readCookie } from "./read-cookie";

describe("readCookie", () => {
  test("reads URL-encoded values (what the client SDK writes)", () => {
    const blob = JSON.stringify({ type: "access", token: "a.b.c" });
    expect(readCookie(`x=1; access_token_app=${encodeURIComponent(blob)}; y=2`, "access_token_app")).toBe(blob);
  });

  test("reads raw JSON values that RFC 6265 parsers would drop", () => {
    const blob = '{"type":"access","token":"a.b.c","exp":1}';
    expect(readCookie(`access_token_app=${blob}`, "access_token_app")).toBe(blob);
  });

  test("returns undefined for a missing cookie or header", () => {
    expect(readCookie("a=1; b=2", "c")).toBeUndefined();
    expect(readCookie(null, "c")).toBeUndefined();
    expect(readCookie("", "c")).toBeUndefined();
  });

  test("does not match names by prefix and keeps a malformed percent-encoding verbatim", () => {
    expect(readCookie("refresh_token_app_other=zzz; refresh_token_app=abc", "refresh_token_app")).toBe("abc");
    expect(readCookie("t=100%", "t")).toBe("100%");
  });
});
