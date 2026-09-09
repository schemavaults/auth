import { describe, expect, test } from "bun:test";
import * as oidc from "openid-client";
import type { ISchemaVaultsAuthClientAdapter } from "@/types/ISchemaVaultsAuthClientAdapter";
import { buildOidcProviderMetadata } from "@schemavaults/auth-common";
import { createOidcClientConfiguration } from "./oidc-client-configuration";

function makeAdapter(
  fetchImpl: ISchemaVaultsAuthClientAdapter["fetch"],
): ISchemaVaultsAuthClientAdapter {
  // Only `fetch` is exercised by the configuration; the rest is inert.
  return { fetch: fetchImpl } as unknown as ISchemaVaultsAuthClientAdapter;
}

describe("createOidcClientConfiguration", () => {
  test("is a public (auth method none) client for the configured app id", () => {
    const config = createOidcClientConfiguration({
      auth_server_url: "https://auth.example.com",
      client_app_id: "my-app",
      adapter: makeAdapter(async () => new Response(null)),
    });
    expect(config.clientMetadata().client_id).toBe("my-app");
    expect(config.clientMetadata().token_endpoint_auth_method).toBe("none");
    expect(config.serverMetadata().issuer).toBe("https://auth.example.com");
    expect(config.serverMetadata().supportsPKCE("S256")).toBe(true);
  });

  test("uses the auth server's own discovery document as server metadata", () => {
    // The same builder produces /.well-known/openid-configuration on the
    // server, so the SDK's view of the endpoints and capabilities is the
    // server's by construction.
    const config = createOidcClientConfiguration({
      auth_server_url: "https://auth.example.com/",
      client_app_id: "my-app",
      adapter: makeAdapter(async () => new Response(null)),
    });
    const expected = buildOidcProviderMetadata("https://auth.example.com");
    const actual = config.serverMetadata();
    for (const [key, value] of Object.entries(expected)) {
      expect(actual[key as keyof typeof expected], key).toEqual(value);
    }
    expect(actual.authorization_response_iss_parameter_supported).toBe(true);
  });

  test("routes requests through the adapter fetch, with credentials only for the token endpoint", async () => {
    type AdapterFetchInit = Parameters<
      ISchemaVaultsAuthClientAdapter["fetch"]
    >[1];
    const calls: { url: string; init: AdapterFetchInit }[] = [];
    const config = createOidcClientConfiguration({
      auth_server_url: "https://auth.example.com/",
      client_app_id: "my-app",
      adapter: makeAdapter(async (url, init) => {
        calls.push({ url, init });
        return new Response("{}", {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    });
    const customFetch = config[oidc.customFetch];
    expect(typeof customFetch).toBe("function");
    if (!customFetch) throw new Error("unreachable");

    await customFetch("https://auth.example.com/api/oidc/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "grant_type=refresh_token",
      redirect: "manual",
    });
    await customFetch("https://auth.example.com/api/oidc/jwks", {
      method: "GET",
      headers: {},
      body: undefined,
      redirect: "manual",
    });

    expect(calls).toHaveLength(2);
    expect(calls[0]?.init?.credentials).toBe("include");
    expect(calls[0]?.init?.method).toBe("POST");
    expect(calls[1]?.init?.credentials).toBe("same-origin");
  });

  test("allows plain-HTTP issuers (local dev / test network)", async () => {
    // openid-client refuses http: endpoints unless allowInsecureRequests
    // was applied; a refresh grant against a stubbed http server proves
    // the request is attempted (and reaches the adapter's fetch).
    const requested: string[] = [];
    const config = createOidcClientConfiguration({
      auth_server_url: "http://localhost:6767",
      client_app_id: "my-app",
      adapter: makeAdapter(async (url) => {
        requested.push(url);
        return new Response(
          JSON.stringify({
            error: "invalid_grant",
            error_description: "nope",
          }),
          { status: 400, headers: { "content-type": "application/json" } },
        );
      }),
    });
    await expect(
      oidc.refreshTokenGrant(config, "refresh.jwt", { resource: "my-api" }),
    ).rejects.toBeInstanceOf(oidc.ResponseBodyError);
    expect(requested).toEqual(["http://localhost:6767/api/oidc/token"]);
  });
});
