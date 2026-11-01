import { describe, expect, test } from "bun:test";
import {
  sanitizeDisplayText,
  summarizeDynamicClientRegistrationMetadata,
  toSafeExternalLink,
} from "./registration-metadata";

describe("toSafeExternalLink", () => {
  test("links https and http URLs in their parsed form", () => {
    expect(toSafeExternalLink("https://claude.ai/")).toEqual({
      safe: true,
      href: "https://claude.ai/",
    });
    expect(toSafeExternalLink("http://example.com/terms")).toEqual({
      safe: true,
      href: "http://example.com/terms",
    });
  });

  test("shows internationalized hosts in punycode", () => {
    // Cyrillic small letter a (U+0430) in place of the Latin "a".
    expect(toSafeExternalLink("https://cl\u0430ude.ai/")).toEqual({
      safe: true,
      href: "https://xn--clude-5ve.ai/",
    });
  });

  test("refuses other schemes", () => {
    expect(toSafeExternalLink("javascript:alert(1)")).toMatchObject({
      safe: false,
      reason: "scheme",
    });
    expect(
      toSafeExternalLink("data:text/html,<script>alert(1)</script>"),
    ).toMatchObject({ safe: false, reason: "scheme" });
  });

  test("refuses URLs with embedded credentials", () => {
    expect(
      toSafeExternalLink("https://claude.ai@evil.example/"),
    ).toEqual({
      safe: false,
      text: "https://claude.ai@evil.example/",
      reason: "credentials",
    });
  });

  test("refuses unparseable values", () => {
    expect(toSafeExternalLink("not a url")).toEqual({
      safe: false,
      text: "not a url",
      reason: "unparseable",
    });
  });
});

describe("sanitizeDisplayText", () => {
  test("replaces bidirectional overrides and control characters", () => {
    expect(sanitizeDisplayText("admin\u202Emoc.elpmaxe@")).toBe(
      "admin\uFFFDmoc.elpmaxe@",
    );
    expect(sanitizeDisplayText("a\u0000b\u2066c")).toBe("a\uFFFDb\uFFFDc");
  });

  test("leaves ordinary text alone", () => {
    expect(sanitizeDisplayText("Claude Desktop 1.2 \u2014 \u2713")).toBe(
      "Claude Desktop 1.2 \u2014 \u2713",
    );
  });
});

describe("summarizeDynamicClientRegistrationMetadata", () => {
  test("summarizes a full registration", () => {
    const summary = summarizeDynamicClientRegistrationMetadata({
      client_uri: "https://claude.ai",
      logo_uri: "https://claude.ai/logo.png",
      tos_uri: null,
      policy_uri: "https://claude.ai@evil.example/privacy",
      contacts: ["ops@example.com", "ops@example.com", "  "],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      software_id: "claude-mcp",
      software_version: "1.0.0",
      registered_scope: "  openid  profile openid ",
      client_id_issued_at: 1_700_000_000,
    });

    expect(summary.links).toEqual([
      {
        field: "client_uri",
        label: "Home page",
        link: { safe: true, href: "https://claude.ai/" },
      },
      {
        field: "logo_uri",
        label: "Logo",
        link: { safe: true, href: "https://claude.ai/logo.png" },
      },
      { field: "tos_uri", label: "Terms of service", link: null },
      {
        field: "policy_uri",
        label: "Privacy policy",
        link: {
          safe: false,
          text: "https://claude.ai@evil.example/privacy",
          reason: "credentials",
        },
      },
    ]);
    expect(summary.contacts).toEqual(["ops@example.com"]);
    expect(summary.grant_types).toEqual(["authorization_code", "refresh_token"]);
    expect(summary.response_types).toEqual(["code"]);
    expect(summary.token_endpoint_auth_method).toBe("none");
    expect(summary.requested_scopes).toEqual(["openid", "profile"]);
    expect(summary.software_id).toBe("claude-mcp");
    expect(summary.software_version).toBe("1.0.0");
    expect(summary.client_id_issued_at_ms).toBe(1_700_000_000_000);
  });

  test("treats absent metadata as empty", () => {
    const summary = summarizeDynamicClientRegistrationMetadata({});
    expect(summary.links.every((entry) => entry.link === null)).toBe(true);
    expect(summary.contacts).toEqual([]);
    expect(summary.grant_types).toEqual([]);
    expect(summary.response_types).toEqual([]);
    expect(summary.requested_scopes).toEqual([]);
    expect(summary.token_endpoint_auth_method).toBeNull();
    expect(summary.software_id).toBeNull();
    expect(summary.software_version).toBeNull();
    expect(summary.client_id_issued_at_ms).toBeNull();
  });
});
