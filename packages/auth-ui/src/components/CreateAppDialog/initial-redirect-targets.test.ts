import { describe, expect, test } from "bun:test";
import {
  buildInitialRedirectTargets,
  emptyInitialRedirectTargets,
  hasInitialCallbackUrl,
  suggestedDomainsForCallbackUrls,
} from "./initial-redirect-targets";

describe("buildInitialRedirectTargets", () => {
  test("an empty section builds empty lists", () => {
    const result = buildInitialRedirectTargets(emptyInitialRedirectTargets("test"));
    expect(result).toEqual({ ok: true, initial_domains: [], initial_callback_urls: [] });
  });

  test("trims rows, skips blank ones and stamps the environment", () => {
    const result = buildInitialRedirectTargets({
      environment: "production",
      domains: ["  https://app.example.com ", ""],
      callback_urls: ["", "https://app.example.com/auth/callback"],
    });
    expect(result).toEqual({
      ok: true,
      initial_domains: [{ domain: "https://app.example.com", environment: "production" }],
      initial_callback_urls: [
        { callback_url: "https://app.example.com/auth/callback", environment: "production" },
      ],
    });
  });

  test("reports invalid and repeated rows at their index", () => {
    const result = buildInitialRedirectTargets({
      environment: "test",
      domains: ["https://app.example.com/path", "https://ok.example.com", "https://OK.example.com/"],
      callback_urls: ["https://app.example.com/cb#frag", "https://app.example.com/cb", "https://app.example.com/cb"],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.domains[0]).toBeString();
    expect(result.errors.domains[1]).toBeUndefined();
    expect(result.errors.domains[2]).toBe("This domain is already listed");
    expect(result.errors.callback_urls[0]).toBeString();
    expect(result.errors.callback_urls[1]).toBeUndefined();
    expect(result.errors.callback_urls[2]).toBe("This callback URL is already listed");
  });
});

describe("hasInitialCallbackUrl", () => {
  test("ignores blank rows", () => {
    expect(hasInitialCallbackUrl(emptyInitialRedirectTargets("test"))).toBe(false);
    expect(
      hasInitialCallbackUrl({ environment: "test", domains: [], callback_urls: ["  ", "x"] }),
    ).toBe(true);
  });
});

describe("suggestedDomainsForCallbackUrls", () => {
  test("suggests the unlisted origins of http(s) callback URLs once", () => {
    expect(
      suggestedDomainsForCallbackUrls({
        environment: "test",
        domains: ["https://listed.example.com/"],
        callback_urls: [
          "https://listed.example.com/cb",
          "https://new.example.com/a",
          "https://new.example.com/b",
          "com.example.app:/oauth2redirect",
          "not a url",
        ],
      }),
    ).toEqual(["https://new.example.com"]);
  });
});
