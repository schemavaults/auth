import { describe, expect, test } from "bun:test";
import { resolveRedirectUriValidationTier } from "./redirect-uri-validation-tier";

describe("resolveRedirectUriValidationTier", () => {
  test("registered callback URLs always mean an exact match", () => {
    for (const hardcoded of [false, true]) {
      for (const confidential of [false, true]) {
        expect(
          resolveRedirectUriValidationTier({
            has_callback_urls: true,
            hardcoded,
            confidential,
          }),
        ).toBe("exact_callback_urls");
      }
    }
  });

  test("a public client without callback URLs is refused (no origin fallback)", () => {
    expect(
      resolveRedirectUriValidationTier({
        has_callback_urls: false,
        hardcoded: false,
        confidential: false,
      }),
    ).toBe("refuse");
  });

  test("a confidential client without callback URLs falls back to its origins", () => {
    expect(
      resolveRedirectUriValidationTier({
        has_callback_urls: false,
        hardcoded: false,
        confidential: true,
      }),
    ).toBe("registered_origins");
  });

  test("hardcoded apps validate against their environment-derived origins", () => {
    expect(
      resolveRedirectUriValidationTier({
        has_callback_urls: false,
        hardcoded: true,
        confidential: false,
      }),
    ).toBe("registered_origins");
  });
});
