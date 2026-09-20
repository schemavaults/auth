import { describe, expect, it } from "bun:test";
import type { DecodedTokenClaims } from "@schemavaults/auth-server-sdk/route_guards";
import { buildTokenRevocationCheck } from "./route-guard-token-revocation-check";

const UID = "11111111-1111-4111-8111-111111111111";

function claims(overrides: Partial<DecodedTokenClaims> = {}): DecodedTokenClaims {
  return {
    jti: "22222222-2222-4222-8222-222222222222",
    iat: 1_700_000_100,
    uid: UID,
    type: "refresh",
    ...overrides,
  };
}

describe("buildTokenRevocationCheck", () => {
  it("accepts a token whose jti is not revoked and whose iat is at/after the watermark", async () => {
    const check = buildTokenRevocationCheck({
      isJtiRevoked: async () => false,
      getTokensValidAfter: async () => 1_700_000_100,
    });
    expect(await check(claims())).toBe(false);
  });

  it("revokes a token whose jti has been revoked, without consulting the watermark", async () => {
    let watermarkReads = 0;
    const check = buildTokenRevocationCheck({
      isJtiRevoked: async (jti) => jti === claims().jti,
      getTokensValidAfter: async () => {
        watermarkReads++;
        return 0;
      },
    });
    expect(await check(claims())).toBe(true);
    expect(watermarkReads).toBe(0);
  });

  it("revokes a token issued before the user's tokens_valid_after watermark", async () => {
    const check = buildTokenRevocationCheck({
      isJtiRevoked: async () => false,
      getTokensValidAfter: async () => 1_700_000_101,
    });
    expect(await check(claims({ iat: 1_700_000_100 }))).toBe(true);
  });

  it("applies the watermark to legacy tokens without a jti", async () => {
    let jtiChecks = 0;
    const check = buildTokenRevocationCheck({
      isJtiRevoked: async () => {
        jtiChecks++;
        return false;
      },
      getTokensValidAfter: async () => 1_700_000_200,
    });
    expect(await check(claims({ jti: null }))).toBe(true);
    expect(jtiChecks).toBe(0);
  });

  it("forwards the token type to the jti check (refresh tokens get the rotation grace)", async () => {
    const seen: string[] = [];
    const check = buildTokenRevocationCheck({
      isJtiRevoked: async (_jti, type) => {
        seen.push(type);
        return false;
      },
      getTokensValidAfter: async () => 0,
    });
    await check(claims({ type: "refresh" }));
    await check(claims({ type: "access" }));
    expect(seen).toEqual(["refresh", "access"]);
  });

  it("reads the watermark once per uid across several tokens in one request", async () => {
    let reads = 0;
    const check = buildTokenRevocationCheck({
      isJtiRevoked: async () => false,
      getTokensValidAfter: async () => {
        reads++;
        return 0;
      },
    });
    await Promise.all([
      check(claims({ type: "refresh" })),
      check(claims({ type: "access", jti: "33333333-3333-4333-8333-333333333333" })),
    ]);
    expect(reads).toBe(1);
  });

  it("propagates lookup failures so the guard fails closed", async () => {
    const check = buildTokenRevocationCheck({
      isJtiRevoked: async () => false,
      getTokensValidAfter: async () => {
        throw new Error("db down");
      },
    });
    await expect(check(claims())).rejects.toThrow("db down");
  });
});
