import { describe, expect, test } from "bun:test";
import {
  OIDC_USERINFO_AUDIENCE_ID,
  getAuthServerUrl,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import {
  isTokenIssuedToCaller,
  resolveIntrospectionDecodePlan,
} from "./caller-visibility";
import type { OidcIntrospectionCaller } from "./types";

const environment: SchemaVaultsAppEnvironment = "test";
const AUTH_SERVER_APP_ID = "schemavaults-auth" as const;
const AUTH_SERVER_URL: string = getAuthServerUrl(environment);

const API_SERVER_ID = "4f7c2f4e-9d6a-4a1b-8f3e-2c5d6e7f8a9b" as const;
const OTHER_API_SERVER_ID = "11111111-1111-4111-8111-111111111111" as const;
const CLIENT_APP_ID = "22222222-2222-4222-8222-222222222222" as const;
const RESOURCE_URL = "https://api.example.com/mcp" as const;

const clientApp: OidcIntrospectionCaller = {
  kind: "client_app",
  client_app_id: CLIENT_APP_ID,
};
const apiServer: OidcIntrospectionCaller = {
  kind: "api_server",
  api_server_id: API_SERVER_ID,
};

function plan(caller: OidcIntrospectionCaller, token_audience: string) {
  return resolveIntrospectionDecodePlan({
    caller,
    token_audience,
    environment,
    auth_server_app_id: AUTH_SERVER_APP_ID,
  });
}

describe("resolveIntrospectionDecodePlan", () => {
  describe("a client app", () => {
    test("sees `oidc-userinfo` access tokens", () => {
      expect(plan(clientApp, OIDC_USERINFO_AUDIENCE_ID)).toEqual({
        kind: "access",
        keyset_audience_id: OIDC_USERINFO_AUDIENCE_ID,
        expected_audience: OIDC_USERINFO_AUDIENCE_ID,
      });
    });

    test("sees refresh tokens (the auth server's own audience)", () => {
      expect(plan(clientApp, AUTH_SERVER_URL)).toEqual({
        kind: "refresh",
        keyset_audience_id: AUTH_SERVER_APP_ID,
      });
    });

    test("never sees tokens minted for API servers", () => {
      expect(plan(clientApp, API_SERVER_ID)).toBeNull();
      expect(plan(clientApp, RESOURCE_URL)).toBeNull();
    });
  });

  describe("an API server", () => {
    test("sees access tokens minted for its id, decrypted with its keyset", () => {
      expect(plan(apiServer, API_SERVER_ID)).toEqual({
        kind: "access",
        keyset_audience_id: API_SERVER_ID,
        expected_audience: API_SERVER_ID,
      });
    });

    test("sees resource-URL tokens, decrypted with its own keyset", () => {
      expect(plan(apiServer, RESOURCE_URL)).toEqual({
        kind: "access",
        keyset_audience_id: API_SERVER_ID,
        expected_audience: RESOURCE_URL,
      });
    });

    test("never sees another API server's id-audience tokens", () => {
      expect(plan(apiServer, OTHER_API_SERVER_ID)).toBeNull();
    });

    test("never sees the auth server's own tokens", () => {
      expect(plan(apiServer, OIDC_USERINFO_AUDIENCE_ID)).toBeNull();
      expect(plan(apiServer, AUTH_SERVER_URL)).toBeNull();
    });
  });
});

describe("isTokenIssuedToCaller", () => {
  test("a client app only sees tokens issued to it", () => {
    expect(isTokenIssuedToCaller(clientApp, { app: CLIENT_APP_ID })).toBe(true);
    expect(
      isTokenIssuedToCaller(clientApp, {
        app: "33333333-3333-4333-8333-333333333333",
      }),
    ).toBe(false);
  });

  test("an API server's keyset binding already proved ownership", () => {
    expect(isTokenIssuedToCaller(apiServer, { app: CLIENT_APP_ID })).toBe(true);
  });
});
