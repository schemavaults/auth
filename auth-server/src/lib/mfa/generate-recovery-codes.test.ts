import { describe, test, expect } from "bun:test";
import {
  generateRecoveryCodes,
  RECOVERY_CODE_COUNT,
} from "./generate-recovery-codes";

describe("generateRecoveryCodes", () => {
  test("returns the default count of unique codes", () => {
    const codes = generateRecoveryCodes();
    expect(codes.length).toBe(RECOVERY_CODE_COUNT);
    expect(new Set(codes).size).toBe(codes.length);
  });

  test("returns the requested count", () => {
    const codes = generateRecoveryCodes(3);
    expect(codes.length).toBe(3);
  });

  test("each code is 11 chars (5-5 with dash) of the unambiguous alphabet", () => {
    const codes = generateRecoveryCodes();
    for (const code of codes) {
      expect(code).toMatch(/^[0-9a-hjkmnp-tv-z]{5}-[0-9a-hjkmnp-tv-z]{5}$/);
    }
  });
});
