import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import {
  getRpId,
  getRpName,
  getExpectedOrigin,
  bytesToBase64Url,
  base64UrlToBytes,
  parseTransports,
} from "./webauthn";

// Snapshot and restore the RP-identity env overrides around each test so we
// can exercise the override path deterministically without depending on the
// app-environment-derived defaults.
const ENV_KEYS = [
  "PRIVATE_WEBAUTHN_RP_ID",
  "PRIVATE_WEBAUTHN_RP_NAME",
] as const;
let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) saved[k] = process.env[k];
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("webauthn RP identity", () => {
  test("getRpId honors PRIVATE_WEBAUTHN_RP_ID override", () => {
    process.env.PRIVATE_WEBAUTHN_RP_ID = "auth.example.com";
    expect(getRpId()).toBe("auth.example.com");
  });

  test("getRpName honors PRIVATE_WEBAUTHN_RP_NAME override", () => {
    process.env.PRIVATE_WEBAUTHN_RP_NAME = "Example Co";
    expect(getRpName()).toBe("Example Co");
  });

  test("getExpectedOrigin returns a valid absolute origin", () => {
    const origin = getExpectedOrigin();
    // Must be a URL origin (scheme://host[:port]) with no trailing path.
    expect(() => new URL(origin)).not.toThrow();
    expect(new URL(origin).origin).toBe(origin);
  });

  test("derived RP id (no override) is the auth server hostname", () => {
    delete process.env.PRIVATE_WEBAUTHN_RP_ID;
    const rpId = getRpId();
    const origin = getExpectedOrigin();
    expect(rpId).toBe(new URL(origin).hostname);
  });
});

describe("webauthn base64url helpers", () => {
  test("bytes <-> base64url round-trips", () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 255, 128, 64]);
    const encoded = bytesToBase64Url(bytes);
    // base64url uses no '+', '/', or '=' padding.
    expect(encoded).not.toMatch(/[+/=]/);
    const decoded = base64UrlToBytes(encoded);
    expect(Array.from(decoded)).toEqual(Array.from(bytes));
  });

  test("base64UrlToBytes yields an ArrayBuffer-backed Uint8Array", () => {
    const out = base64UrlToBytes(bytesToBase64Url(new Uint8Array([9, 9, 9])));
    expect(out.buffer).toBeInstanceOf(ArrayBuffer);
  });
});

describe("parseTransports", () => {
  test("returns undefined for null/empty", () => {
    expect(parseTransports(null)).toBeUndefined();
    expect(parseTransports("")).toBeUndefined();
  });

  test("parses a JSON array of transport strings", () => {
    expect(parseTransports(JSON.stringify(["usb", "nfc"]))).toEqual([
      "usb",
      "nfc",
    ]);
  });

  test("returns undefined for malformed JSON", () => {
    expect(parseTransports("not-json")).toBeUndefined();
  });

  test("filters non-string entries", () => {
    expect(parseTransports(JSON.stringify(["usb", 5, null]))).toEqual([
      "usb",
    ]);
  });
});
