import { describe, expect, test } from "bun:test";
import { isOriginInAllowedList } from "./is-origin-in-allowed-list";

describe("isOriginInAllowedList", () => {
  test("matches an origin exactly", () => {
    expect(
      isOriginInAllowedList("https://app.example.com", [
        "https://app.example.com",
      ]),
    ).toBeTrue();
  });

  test("matches when the request origin has a trailing slash", () => {
    expect(
      isOriginInAllowedList("https://app.example.com/", [
        "https://app.example.com",
      ]),
    ).toBeTrue();
  });

  test("matches when the allowed origin has a trailing slash", () => {
    expect(
      isOriginInAllowedList("https://app.example.com", [
        "https://app.example.com/",
      ]),
    ).toBeTrue();
  });

  test("matches against a list with multiple entries", () => {
    expect(
      isOriginInAllowedList("https://b.example.com", [
        "https://a.example.com",
        "https://b.example.com",
        "https://c.example.com",
      ]),
    ).toBeTrue();
  });

  test("does not match a different origin", () => {
    expect(
      isOriginInAllowedList("https://evil.example.com", [
        "https://app.example.com",
      ]),
    ).toBeFalse();
  });

  test("does not match a subdomain of an allowed origin", () => {
    expect(
      isOriginInAllowedList("https://sub.app.example.com", [
        "https://app.example.com",
      ]),
    ).toBeFalse();
  });

  test("does not match a different scheme", () => {
    expect(
      isOriginInAllowedList("http://app.example.com", [
        "https://app.example.com",
      ]),
    ).toBeFalse();
  });

  test("returns false for an empty allow-list", () => {
    expect(isOriginInAllowedList("https://app.example.com", [])).toBeFalse();
  });
});
