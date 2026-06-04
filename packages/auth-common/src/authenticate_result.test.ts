import { describe, test, expect } from "bun:test";
import {
  authenticateResultSchema,
  authenticatedAuthenticateResultSchema,
  mfaRequiredAuthenticateResultSchema,
  authenticateFailureResultSchema,
  challengeExpiredAuthenticateResultSchema,
  collapseWebauthnFactors,
  type AvailableMfaFactor,
} from "./authenticate_result";

describe("authenticateResultSchema (discriminated union)", () => {
  test("parses authenticated variant", () => {
    const value = {
      kind: "authenticated" as const,
      success: true as const,
      message: "Login successful",
      authorization_code: "a".repeat(43),
    };
    const parsed = authenticateResultSchema.parse(value);
    expect(parsed.kind).toBe("authenticated");
    expect(authenticatedAuthenticateResultSchema.safeParse(value).success).toBe(true);
  });

  test("rejects authenticated variant with too-short authorization_code", () => {
    const value = {
      kind: "authenticated" as const,
      success: true as const,
      message: "Login successful",
      authorization_code: "short",
    };
    expect(authenticateResultSchema.safeParse(value).success).toBe(false);
  });

  test("parses mfa_required variant", () => {
    const value = {
      kind: "mfa_required" as const,
      success: true as const,
      message: "MFA required",
      challenge_id: "11111111-1111-4111-8111-111111111111",
      expires_at: Date.now() + 5 * 60 * 1000,
      available_factors: [
        {
          factor_id: "22222222-2222-4222-8222-222222222222",
          factor_type: "totp" as const,
          last_used_at: null,
        },
      ],
      recovery_codes_available: true,
    };
    const parsed = authenticateResultSchema.parse(value);
    expect(parsed.kind).toBe("mfa_required");
    expect(mfaRequiredAuthenticateResultSchema.safeParse(value).success).toBe(true);
  });

  test("parses mfa_required variant with empty factor list", () => {
    const value = {
      kind: "mfa_required" as const,
      success: true as const,
      message: "MFA required",
      challenge_id: "11111111-1111-4111-8111-111111111111",
      expires_at: Date.now() + 5 * 60 * 1000,
      available_factors: [],
      recovery_codes_available: false,
    };
    expect(mfaRequiredAuthenticateResultSchema.safeParse(value).success).toBe(true);
  });

  test("rejects mfa_required variant missing available_factors", () => {
    const value = {
      kind: "mfa_required" as const,
      success: true as const,
      message: "MFA required",
      challenge_id: "11111111-1111-4111-8111-111111111111",
      expires_at: Date.now() + 5 * 60 * 1000,
      recovery_codes_available: false,
    };
    expect(mfaRequiredAuthenticateResultSchema.safeParse(value).success).toBe(false);
  });

  test("rejects mfa_required variant without challenge_id", () => {
    const value = {
      kind: "mfa_required" as const,
      success: true as const,
      message: "MFA required",
      expires_at: Date.now(),
    };
    expect(authenticateResultSchema.safeParse(value).success).toBe(false);
  });

  test("parses failure variant", () => {
    const value = {
      kind: "failure" as const,
      success: false as const,
      message: "Invalid email or password",
    };
    const parsed = authenticateResultSchema.parse(value);
    expect(parsed.kind).toBe("failure");
    expect(authenticateFailureResultSchema.safeParse(value).success).toBe(true);
  });

  test("parses challenge_expired variant", () => {
    const value = {
      kind: "challenge_expired" as const,
      success: false as const,
      message: "Too many incorrect attempts. Please log in again.",
    };
    const parsed = authenticateResultSchema.parse(value);
    expect(parsed.kind).toBe("challenge_expired");
    expect(
      challengeExpiredAuthenticateResultSchema.safeParse(value).success,
    ).toBe(true);
  });

  test("rejects an object missing kind discriminator", () => {
    const value = {
      success: true,
      message: "Login successful",
      authorization_code: "a".repeat(43),
    };
    expect(authenticateResultSchema.safeParse(value).success).toBe(false);
  });

  test("rejects authenticated variant with stray fields (strict)", () => {
    const value = {
      kind: "authenticated" as const,
      success: true as const,
      message: "Login successful",
      authorization_code: "a".repeat(43),
      extra: "nope",
    };
    expect(authenticateResultSchema.safeParse(value).success).toBe(false);
  });
});

describe("collapseWebauthnFactors", () => {
  const ID = {
    totpA: "22222222-2222-4222-8222-222222222222",
    totpB: "33333333-3333-4333-8333-333333333333",
    pkA: "44444444-4444-4444-8444-444444444444",
    pkB: "55555555-5555-4555-8555-555555555555",
    pkC: "66666666-6666-4666-8666-666666666666",
  };
  const totp = (
    factor_id: string,
    last_used_at: number | null = null,
  ): AvailableMfaFactor => ({ factor_id, factor_type: "totp", last_used_at });
  const webauthn = (
    factor_id: string,
    last_used_at: number | null = null,
  ): AvailableMfaFactor => ({
    factor_id,
    factor_type: "webauthn",
    last_used_at,
  });

  test("folds multiple passkeys into a single representative row", () => {
    const result = collapseWebauthnFactors([
      webauthn(ID.pkA, 300),
      webauthn(ID.pkB, 200),
      webauthn(ID.pkC, 100),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]?.factor_id).toBe(ID.pkA);
    expect(result[0]?.factor_type).toBe("webauthn");
  });

  test("keeps the first (most-recently-used) passkey as the representative", () => {
    // Input is sorted last_used_at DESC NULLS LAST, so the survivor must be
    // the head of the passkey run, not a later one.
    const result = collapseWebauthnFactors([
      webauthn(ID.pkB, 500),
      webauthn(ID.pkA, 10),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]?.factor_id).toBe(ID.pkB);
  });

  test("leaves non-webauthn factors untouched and preserves order", () => {
    const result = collapseWebauthnFactors([
      totp(ID.totpA, 400),
      webauthn(ID.pkA, 300),
      webauthn(ID.pkB, 200),
      totp(ID.totpB, 100),
    ]);
    expect(result.map((f) => f.factor_id)).toEqual([
      ID.totpA,
      ID.pkA,
      ID.totpB,
    ]);
  });

  test("preserves multiple distinct totp factors (only passkeys collapse)", () => {
    const result = collapseWebauthnFactors([
      totp(ID.totpA, 400),
      totp(ID.totpB, 300),
    ]);
    expect(result.map((f) => f.factor_id)).toEqual([ID.totpA, ID.totpB]);
  });

  test("returns a single webauthn factor unchanged", () => {
    const input = [webauthn(ID.pkA, 100)];
    expect(collapseWebauthnFactors(input)).toEqual(input);
  });

  test("returns an empty list for an empty input", () => {
    expect(collapseWebauthnFactors([])).toEqual([]);
  });

  test("does not mutate the input array", () => {
    const input = [webauthn(ID.pkA, 200), webauthn(ID.pkB, 100)];
    collapseWebauthnFactors(input);
    expect(input.map((f) => f.factor_id)).toEqual([ID.pkA, ID.pkB]);
  });
});
