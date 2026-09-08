import { describe, expect, test } from "bun:test";
import {
  DEFAULT_OIDC_REFRESH_TOKEN_DELIVERY_MODE,
  OIDC_TOKEN_REFRESH_TOKEN_DELIVERY_PARAM,
  OIDC_TOKEN_REFRESH_TOKEN_EXPIRES_IN_FIELD,
  OIDC_TOKEN_RESOURCE_PARAM,
  oidcRefreshTokenDeliveryModeSchema,
  oidcTokenResponseExtensionsSchema,
} from "./token-endpoint-extensions";

describe("token endpoint extension parameter names", () => {
  test("resource is the RFC 8707 parameter name", () => {
    expect(OIDC_TOKEN_RESOURCE_PARAM).toBe("resource");
  });

  test("delivery param + expires_in field are stable wire names", () => {
    expect(OIDC_TOKEN_REFRESH_TOKEN_DELIVERY_PARAM).toBe(
      "refresh_token_delivery",
    );
    expect(OIDC_TOKEN_REFRESH_TOKEN_EXPIRES_IN_FIELD).toBe(
      "refresh_token_expires_in",
    );
  });
});

describe("oidcRefreshTokenDeliveryModeSchema", () => {
  test("accepts the two delivery modes", () => {
    expect(oidcRefreshTokenDeliveryModeSchema.parse("inline")).toBe("inline");
    expect(oidcRefreshTokenDeliveryModeSchema.parse("http_only_cookie")).toBe(
      "http_only_cookie",
    );
    expect(DEFAULT_OIDC_REFRESH_TOKEN_DELIVERY_MODE).toBe("inline");
  });

  test("rejects unknown modes", () => {
    expect(oidcRefreshTokenDeliveryModeSchema.safeParse("cookie").success).toBe(
      false,
    );
    expect(oidcRefreshTokenDeliveryModeSchema.safeParse("").success).toBe(false);
  });
});

describe("oidcTokenResponseExtensionsSchema", () => {
  test("parses a standard token response with the extension field", () => {
    const parsed = oidcTokenResponseExtensionsSchema.parse({
      access_token: "abc",
      token_type: "Bearer",
      expires_in: 5400,
      refresh_token_expires_in: 1209600,
    });
    expect(parsed.refresh_token_expires_in).toBe(1209600);
    // Unknown (standard) fields pass through untouched.
    expect(parsed.access_token).toBe("abc");
  });

  test("tolerates the field being absent", () => {
    expect(
      oidcTokenResponseExtensionsSchema.parse({ access_token: "abc" })
        .refresh_token_expires_in,
    ).toBeUndefined();
  });

  test("rejects non-positive or fractional lifetimes", () => {
    for (const bad of [0, -1, 1.5, "1209600"]) {
      expect(
        oidcTokenResponseExtensionsSchema.safeParse({
          refresh_token_expires_in: bad,
        }).success,
      ).toBe(false);
    }
  });
});
