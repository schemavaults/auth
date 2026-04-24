import { describe, test, expect } from "bun:test";
import { timingSafeStringEqual } from "./timing-safe-string-equal";

describe("timingSafeStringEqual", () => {
  test("returns true for identical strings", () => {
    expect(timingSafeStringEqual("abc", "abc")).toBe(true);
    expect(timingSafeStringEqual("", "")).toBe(true);
  });

  test("returns false for mismatched strings of equal length", () => {
    expect(timingSafeStringEqual("abc", "abd")).toBe(false);
  });

  test("returns false for strings of differing lengths", () => {
    expect(timingSafeStringEqual("abc", "abcd")).toBe(false);
    expect(timingSafeStringEqual("", "a")).toBe(false);
  });

  test("returns false for non-string inputs", () => {
    // @ts-expect-error intentional runtime misuse
    expect(timingSafeStringEqual(null, "abc")).toBe(false);
    // @ts-expect-error intentional runtime misuse
    expect(timingSafeStringEqual("abc", undefined)).toBe(false);
  });
});
