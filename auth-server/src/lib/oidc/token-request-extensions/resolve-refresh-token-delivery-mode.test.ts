import { describe, expect, test } from "bun:test";
import { DEFAULT_AUTH_SERVER_APP_ID } from "@schemavaults/app-definitions";
import { resolveRefreshTokenDeliveryMode } from "./resolve-refresh-token-delivery-mode";

describe("resolveRefreshTokenDeliveryMode", () => {
  test("the auth server's own app always gets the cookie", () => {
    expect(
      resolveRefreshTokenDeliveryMode(DEFAULT_AUTH_SERVER_APP_ID, "inline", false),
    ).toBe("http_only_cookie");
    expect(
      resolveRefreshTokenDeliveryMode(DEFAULT_AUTH_SERVER_APP_ID, "inline", true),
    ).toBe("http_only_cookie");
  });
  test("other apps get the cookie only when requested in a secure deployment", () => {
    expect(resolveRefreshTokenDeliveryMode("my-app", "http_only_cookie", true)).toBe(
      "http_only_cookie",
    );
    expect(resolveRefreshTokenDeliveryMode("my-app", "http_only_cookie", false)).toBe(
      "inline",
    );
    expect(resolveRefreshTokenDeliveryMode("my-app", "inline", true)).toBe("inline");
  });
  test("a refresh token presented as the app's cookie is never answered inline", () => {
    for (const requested of ["inline", "http_only_cookie"] as const) {
      for (const secure of [true, false]) {
        expect(resolveRefreshTokenDeliveryMode("my-app", requested, secure, true)).toBe(
          "http_only_cookie",
        );
      }
    }
  });
});
