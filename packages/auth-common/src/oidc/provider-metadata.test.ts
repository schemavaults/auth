import { describe, expect, test } from "bun:test";
import { OIDC_ENDPOINT_PATHS } from "./endpoints";
import { OIDC_SUPPORTED_SCOPES } from "./scope";
import { buildOidcProviderMetadata } from "./provider-metadata";

const ISSUER = "https://auth.example.com";

describe("buildOidcProviderMetadata", () => {
  test("advertises every endpoint under the issuer using the shared paths", () => {
    const md = buildOidcProviderMetadata(ISSUER);
    expect(md.issuer).toBe(ISSUER);
    expect(md.authorization_endpoint).toBe(
      `${ISSUER}${OIDC_ENDPOINT_PATHS.authorization}`,
    );
    expect(md.token_endpoint).toBe(`${ISSUER}${OIDC_ENDPOINT_PATHS.token}`);
    expect(md.userinfo_endpoint).toBe(
      `${ISSUER}${OIDC_ENDPOINT_PATHS.userinfo}`,
    );
    expect(md.introspection_endpoint).toBe(
      `${ISSUER}${OIDC_ENDPOINT_PATHS.introspection}`,
    );
    expect(md.jwks_uri).toBe(`${ISSUER}${OIDC_ENDPOINT_PATHS.jwks}`);
  });

  test("advertises the platform's protocol surface", () => {
    const md = buildOidcProviderMetadata(ISSUER);
    expect(md.response_types_supported).toEqual(["code"]);
    expect(md.grant_types_supported).toEqual([
      "authorization_code",
      "refresh_token",
    ]);
    expect(md.code_challenge_methods_supported).toEqual(["S256"]);
    expect(md.id_token_signing_alg_values_supported).toEqual(["RS256"]);
    expect(md.scopes_supported).toEqual([...OIDC_SUPPORTED_SCOPES]);
    expect(md.token_endpoint_auth_methods_supported).toEqual([
      "none",
      "client_secret_basic",
      "client_secret_post",
    ]);
    expect(md.introspection_endpoint_auth_methods_supported).not.toContain(
      "none",
    );
    expect(md.authorization_response_iss_parameter_supported).toBe(true);
    expect(md.request_parameter_supported).toBe(false);
    expect(md.request_uri_parameter_supported).toBe(false);
  });

  test("normalizes a trailing slash on the issuer", () => {
    const md = buildOidcProviderMetadata(`${ISSUER}/`);
    expect(md.issuer).toBe(ISSUER);
    expect(md.token_endpoint).toBe(`${ISSUER}${OIDC_ENDPOINT_PATHS.token}`);
  });

  test("returns a fresh document on every call", () => {
    const a = buildOidcProviderMetadata(ISSUER);
    const b = buildOidcProviderMetadata(ISSUER);
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
    expect(a.scopes_supported).not.toBe(b.scopes_supported);
  });

  test("rejects an empty issuer", () => {
    expect(() => buildOidcProviderMetadata("")).toThrow(TypeError);
  });
});
