import { describe, expect, test } from "bun:test";
import {
  CLIENT_ERROR_FINGERPRINT_REGEX,
  computeClientErrorFingerprint,
  normalizeClientErrorMessage,
  sanitizeReportedPageUrl,
} from "./fingerprint";

describe("normalizeClientErrorMessage", () => {
  test("replaces ids, numbers, URLs and quoted values", () => {
    expect(
      normalizeClientErrorMessage(
        "User '8b0c7a3e-5f8e-4a51-9b5c-1d2e3f4a5b6c' got 503 from https://auth.example.com/api/x?y=1 after 2.5s",
      ),
    ).toBe("User <str> got <n> from <url> after <n>s");
  });

  test("collapses whitespace", () => {
    expect(normalizeClientErrorMessage("  a\n\tb  ")).toBe("a b");
  });
});

describe("computeClientErrorFingerprint", () => {
  test("groups messages that differ only in variable parts", () => {
    const a = computeClientErrorFingerprint({ name: "Error", message: "Request 12 failed with 500" });
    const b = computeClientErrorFingerprint({ name: "Error", message: "Request 99 failed with 502" });
    expect(a).toBe(b);
    expect(a).toMatch(CLIENT_ERROR_FINGERPRINT_REGEX);
  });

  test("separates different names, messages and operations", () => {
    const base = { name: "Error", message: "boom", operation: "login" };
    const fingerprint = computeClientErrorFingerprint(base);
    expect(computeClientErrorFingerprint({ ...base, name: "TypeError" })).not.toBe(fingerprint);
    expect(computeClientErrorFingerprint({ ...base, message: "bang" })).not.toBe(fingerprint);
    expect(computeClientErrorFingerprint({ ...base, operation: "logout" })).not.toBe(fingerprint);
    expect(computeClientErrorFingerprint({ ...base, operation: null })).not.toBe(fingerprint);
  });
});

describe("sanitizeReportedPageUrl", () => {
  test("drops the query string and fragment", () => {
    expect(sanitizeReportedPageUrl("https://app.example.com/auth/callback?code=abc&state=xyz#t=1")).toBe(
      "https://app.example.com/auth/callback",
    );
  });

  test("keeps http(s) URLs only", () => {
    expect(sanitizeReportedPageUrl("http://localhost:3000/")).toBe("http://localhost:3000/");
    expect(sanitizeReportedPageUrl("javascript:alert(1)")).toBeNull();
    expect(sanitizeReportedPageUrl("/relative/path")).toBeNull();
    expect(sanitizeReportedPageUrl(undefined)).toBeNull();
  });
});
