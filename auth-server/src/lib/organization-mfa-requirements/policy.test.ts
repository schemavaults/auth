import { describe, expect, test } from "bun:test";
import {
  computeOrganizationMfaGracePeriodEndsAt,
  getOrganizationMfaComplianceStatus,
} from "./policy";

describe("computeOrganizationMfaGracePeriodEndsAt", () => {
  test("adds whole days to the start", () => {
    const started_at = Date.UTC(2026, 9, 30, 12, 0, 0);
    expect(computeOrganizationMfaGracePeriodEndsAt(started_at, 14)).toBe(Date.UTC(2026, 10, 13, 12, 0, 0));
    expect(computeOrganizationMfaGracePeriodEndsAt(started_at, 1)).toBe(started_at + 86_400_000);
  });
});

describe("getOrganizationMfaComplianceStatus", () => {
  const now = 1_000_000;

  test("no grace period yet is pending", () => {
    expect(getOrganizationMfaComplianceStatus(null, now)).toBe("pending");
  });

  test("a grace period ending later is running", () => {
    expect(getOrganizationMfaComplianceStatus(now + 1, now)).toBe("grace_period");
  });

  test("a grace period ending now or earlier is expired", () => {
    expect(getOrganizationMfaComplianceStatus(now, now)).toBe("expired");
    expect(getOrganizationMfaComplianceStatus(now - 1, now)).toBe("expired");
  });
});
