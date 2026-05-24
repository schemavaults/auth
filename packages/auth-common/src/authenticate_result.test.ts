import { describe, test, expect } from "bun:test";
import {
  authenticateResultSchema,
  authenticatedAuthenticateResultSchema,
  mfaRequiredAuthenticateResultSchema,
  authenticateFailureResultSchema,
  challengeExpiredAuthenticateResultSchema,
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
    };
    const parsed = authenticateResultSchema.parse(value);
    expect(parsed.kind).toBe("mfa_required");
    expect(mfaRequiredAuthenticateResultSchema.safeParse(value).success).toBe(true);
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
