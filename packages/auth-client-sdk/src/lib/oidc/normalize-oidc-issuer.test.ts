import { describe, expect, test } from "bun:test";
import { normalizeOidcIssuer } from "./normalize-oidc-issuer";

describe("normalizeOidcIssuer", () => {
  test("strips a single trailing slash", () => {
    expect(normalizeOidcIssuer("https://auth.example.com/")).toBe(
      "https://auth.example.com",
    );
    expect(normalizeOidcIssuer("https://auth.example.com")).toBe(
      "https://auth.example.com",
    );
  });
  test("rejects empty input", () => {
    expect(() => normalizeOidcIssuer("")).toThrow(TypeError);
  });
});
