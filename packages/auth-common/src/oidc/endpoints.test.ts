import { describe, expect, test } from "bun:test";
import { OIDC_ENDPOINT_PATHS, getOidcEndpointUrl } from "./endpoints";

describe("OIDC_ENDPOINT_PATHS", () => {
  test("every path is absolute and under the auth server's API or well-known tree", () => {
    for (const path of Object.values(OIDC_ENDPOINT_PATHS)) {
      expect(path.startsWith("/")).toBe(true);
      expect(path.startsWith("/api/oidc/") || path.startsWith("/.well-known/")).toBe(
        true,
      );
    }
  });
});

describe("getOidcEndpointUrl", () => {
  test("joins the issuer and the endpoint path", () => {
    expect(getOidcEndpointUrl("https://auth.example.com", "token")).toBe(
      "https://auth.example.com/api/oidc/token",
    );
    expect(getOidcEndpointUrl("http://localhost:6767", "jwks")).toBe(
      "http://localhost:6767/api/oidc/jwks",
    );
  });

  test("tolerates a trailing slash on the issuer", () => {
    expect(getOidcEndpointUrl("https://auth.example.com/", "userinfo")).toBe(
      "https://auth.example.com/api/oidc/userinfo",
    );
  });

  test("rejects an empty issuer", () => {
    expect(() => getOidcEndpointUrl("", "token")).toThrow(TypeError);
  });
});
