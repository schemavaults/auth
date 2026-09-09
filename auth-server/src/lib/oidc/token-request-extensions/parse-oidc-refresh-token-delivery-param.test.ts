import { describe, expect, test } from "bun:test";
import { parseOidcRefreshTokenDeliveryParam } from "./parse-oidc-refresh-token-delivery-param";
import { form } from "./test-form";

describe("parseOidcRefreshTokenDeliveryParam", () => {
  test("defaults to inline", () => {
    expect(parseOidcRefreshTokenDeliveryParam(form([]))).toEqual({
      ok: true,
      mode: "inline",
    });
  });
  test("accepts the cookie mode", () => {
    expect(
      parseOidcRefreshTokenDeliveryParam(
        form([["refresh_token_delivery", "http_only_cookie"]]),
      ),
    ).toEqual({ ok: true, mode: "http_only_cookie" });
  });
  test("rejects unknown modes with invalid_request", () => {
    const parsed = parseOidcRefreshTokenDeliveryParam(
      form([["refresh_token_delivery", "cookie"]]),
    );
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error.error).toBe("invalid_request");
  });
});
