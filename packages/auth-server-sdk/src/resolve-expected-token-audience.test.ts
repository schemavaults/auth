import { describe, expect, test } from "bun:test";
import {
  normalizeAcceptedAudiences,
  resolveExpectedTokenAudience,
} from "./resolve-expected-token-audience";

function tokenWithHeader(header: Record<string, unknown>): string {
  const encoded = Buffer.from(JSON.stringify(header)).toString("base64url");
  return `${encoded}.payload.signature`;
}

const API_SERVER_ID = "00000000-0000-0000-0000-000000000000";
const RESOURCE_URL = "https://mcp.example.com/mcp";

describe("resolveExpectedTokenAudience", () => {
  test("returns the default audience when no accepted audiences are configured", () => {
    expect(
      resolveExpectedTokenAudience(tokenWithHeader({ aud: RESOURCE_URL }), API_SERVER_ID, undefined),
    ).toBe(API_SERVER_ID);
    expect(
      resolveExpectedTokenAudience(tokenWithHeader({ aud: RESOURCE_URL }), API_SERVER_ID, []),
    ).toBe(API_SERVER_ID);
  });

  test("enforces a listed resource URL named by the token header", () => {
    expect(
      resolveExpectedTokenAudience(tokenWithHeader({ aud: RESOURCE_URL }), API_SERVER_ID, [RESOURCE_URL]),
    ).toBe(RESOURCE_URL);
  });

  test("falls back to the default for unlisted or missing header audiences", () => {
    expect(
      resolveExpectedTokenAudience(
        tokenWithHeader({ aud: "https://evil.example.com" }),
        API_SERVER_ID,
        [RESOURCE_URL],
      ),
    ).toBe(API_SERVER_ID);
    expect(
      resolveExpectedTokenAudience(tokenWithHeader({ alg: "RSA-OAEP" }), API_SERVER_ID, [RESOURCE_URL]),
    ).toBe(API_SERVER_ID);
    expect(resolveExpectedTokenAudience("not-a-jwt", API_SERVER_ID, [RESOURCE_URL])).toBe(API_SERVER_ID);
  });
});

describe("normalizeAcceptedAudiences", () => {
  test("accepts http(s) URLs and deduplicates", () => {
    expect(normalizeAcceptedAudiences(undefined)).toEqual([]);
    expect(normalizeAcceptedAudiences([RESOURCE_URL, RESOURCE_URL, "http://127.0.0.1:3007"])).toEqual([
      RESOURCE_URL,
      "http://127.0.0.1:3007",
    ]);
  });

  test("rejects non-URLs, non-http schemes and fragments", () => {
    expect(() => normalizeAcceptedAudiences(["mcp.example.com"])).toThrow(TypeError);
    expect(() => normalizeAcceptedAudiences(["com.example.app:/cb"])).toThrow(TypeError);
    expect(() => normalizeAcceptedAudiences([`${RESOURCE_URL}#x`])).toThrow(TypeError);
    expect(() => normalizeAcceptedAudiences([""])).toThrow(TypeError);
  });
});
