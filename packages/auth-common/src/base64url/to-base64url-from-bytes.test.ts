import { describe, test, expect } from "bun:test";
import { toBase64UrlFromBytes } from "./to-base64url-from-bytes";

describe("toBase64UrlFromBytes", () => {
  test("encodes zero-length input to empty string", () => {
    expect(toBase64UrlFromBytes(new Uint8Array(0))).toBe("");
  });

  test("round-trips through base64url-safe alphabet only", () => {
    const bytes = new Uint8Array([0xff, 0xee, 0xdd, 0xcc, 0xbb, 0xaa]);
    const encoded = toBase64UrlFromBytes(bytes);
    expect(/^[A-Za-z0-9_-]*$/.test(encoded)).toBe(true);
    // No padding.
    expect(encoded.endsWith("=")).toBe(false);
  });

  test("matches standard base64 minus padding with URL-safe alphabet", () => {
    // '\x00\x00\x00' → base64 "AAAA" (no '+' or '/').
    expect(toBase64UrlFromBytes(new Uint8Array([0, 0, 0]))).toBe("AAAA");
    // '\xfb' → base64 "+w==" → base64url "-w".
    expect(toBase64UrlFromBytes(new Uint8Array([0xfb]))).toBe("-w");
    // '\xff\xff' → base64 "//8=" → base64url "__8".
    expect(toBase64UrlFromBytes(new Uint8Array([0xff, 0xff]))).toBe("__8");
  });
});
