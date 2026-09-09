import { describe, expect, test } from "bun:test";
import { tokenEndpointResponseToTokensRecord } from "./token-endpoint-response-to-tokens-record";

const NOW = 1_700_000_000_000;
const UID = "4f7c1c2e-9a4b-4e7a-8c2d-1b2a3c4d5e6f";
const AUTH_SERVER_URL = "https://auth.example.com";

describe("tokenEndpointResponseToTokensRecord", () => {
  test("maps an inline-refresh-token response to access + refresh tokens", () => {
    const record = tokenEndpointResponseToTokensRecord({
      response: {
        access_token: "access.jwe",
        token_type: "Bearer",
        expires_in: 5400,
        refresh_token: "refresh.jwt",
        refresh_token_expires_in: 1_209_600,
        scope: "openid email profile",
      },
      audience: "my-api-server",
      uid: UID,
      auth_server_url: AUTH_SERVER_URL,
      now: NOW,
    });

    expect(record.access?.["my-api-server"]).toEqual({
      type: "access",
      uid: UID,
      iat: NOW,
      exp: NOW + 5400 * 1000,
      token: "access.jwe",
      aud: "my-api-server",
    });
    expect(record.refresh).toEqual({
      type: "refresh",
      uid: UID,
      iat: NOW,
      exp: NOW + 1_209_600 * 1000,
      token: "refresh.jwt",
      aud: AUTH_SERVER_URL,
    });
    expect(record.refresh_token_expiry).toBeUndefined();
  });

  test("maps a cookie-delivered refresh token to the AS_HTTP_ONLY_COOKIE marker", () => {
    const record = tokenEndpointResponseToTokensRecord({
      response: {
        access_token: "access.jwe",
        token_type: "bearer",
        expires_in: 5400,
        refresh_token_expires_in: 600,
      },
      audience: AUTH_SERVER_URL,
      uid: UID,
      auth_server_url: AUTH_SERVER_URL,
      now: NOW,
    });
    expect(record.refresh).toBe("AS_HTTP_ONLY_COOKIE");
    expect(record.refresh_token_expiry).toBe(NOW + 600 * 1000);
    const access = record.access?.[AUTH_SERVER_URL];
    expect(typeof access === "object" ? access.aud : null).toBe(
      AUTH_SERVER_URL,
    );
  });

  test("rejects a response with neither an inline refresh token nor an expiry", () => {
    expect(() =>
      tokenEndpointResponseToTokensRecord({
        response: { access_token: "a", token_type: "Bearer", expires_in: 10 },
        audience: "my-api-server",
        uid: UID,
        auth_server_url: AUTH_SERVER_URL,
        now: NOW,
      }),
    ).toThrow(/refresh_token/);
  });

  test("rejects non-Bearer token types and missing access tokens", () => {
    expect(() =>
      tokenEndpointResponseToTokensRecord({
        response: {
          access_token: "a",
          token_type: "DPoP",
          refresh_token: "r",
        },
        audience: "my-api-server",
        uid: UID,
        auth_server_url: AUTH_SERVER_URL,
      }),
    ).toThrow(/token_type/);
    expect(() =>
      tokenEndpointResponseToTokensRecord({
        response: { access_token: "", token_type: "Bearer" },
        audience: "my-api-server",
        uid: UID,
        auth_server_url: AUTH_SERVER_URL,
      }),
    ).toThrow(/access_token/);
  });

  test("rejects malformed extension fields", () => {
    expect(() =>
      tokenEndpointResponseToTokensRecord({
        response: {
          access_token: "a",
          token_type: "Bearer",
          refresh_token: "r",
          refresh_token_expires_in: "soon",
        },
        audience: "my-api-server",
        uid: UID,
        auth_server_url: AUTH_SERVER_URL,
      }),
    ).toThrow(/extension/);
  });
});

