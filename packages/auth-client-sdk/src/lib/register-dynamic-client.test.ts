import { describe, expect, test } from "bun:test";
import {
  DynamicClientRegistrationFailedError,
  registerDynamicClient,
} from "./register-dynamic-client";

const AUTH_SERVER = "https://auth.example.com";

type FetchInit = Parameters<typeof fetch>[1];

function adapterReturning(status: number, body: unknown, capture: { url?: string; init?: FetchInit } = {}) {
  return {
    fetch: async (url: string | URL | Request, init?: FetchInit): Promise<Response> => {
      capture.url = String(url);
      capture.init = init;
      return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    },
  };
}

const REQUEST = {
  client_name: "Example MCP Client",
  redirect_uris: ["http://127.0.0.1:33418/callback"],
  token_endpoint_auth_method: "none" as const,
  grant_types: ["authorization_code" as const, "refresh_token" as const],
};

describe("registerDynamicClient", () => {
  test("POSTs the metadata to the registration endpoint without credentials and returns the parsed response", async () => {
    const capture: { url?: string; init?: FetchInit } = {};
    const response = {
      client_id: "dcr-123",
      client_id_issued_at: 1700000000,
      redirect_uris: REQUEST.redirect_uris,
      client_name: REQUEST.client_name,
      token_endpoint_auth_method: "none",
      grant_types: REQUEST.grant_types,
      response_types: ["code"],
    };
    const result = await registerDynamicClient({
      adapter: adapterReturning(201, response, capture),
      auth_server_uri: AUTH_SERVER,
      metadata: REQUEST,
    });
    expect(result.client_id).toBe("dcr-123");
    expect(result.client_secret).toBeUndefined();
    expect(capture.url).toBe(`${AUTH_SERVER}/api/oidc/register`);
    expect(capture.init?.method).toBe("POST");
    expect(capture.init?.credentials).toBe("omit");
    expect(JSON.parse(String(capture.init?.body))).toEqual(REQUEST);
  });

  test("surfaces RFC 7591 errors", async () => {
    await expect(
      registerDynamicClient({
        adapter: adapterReturning(400, {
          error: "invalid_redirect_uri",
          error_description: "nope",
        }),
        auth_server_uri: AUTH_SERVER,
        metadata: REQUEST,
      }),
    ).rejects.toMatchObject({
      name: "DynamicClientRegistrationFailedError",
      status: 400,
      error: "invalid_redirect_uri",
      error_description: "nope",
    });
  });

  test("surfaces a disabled endpoint", async () => {
    try {
      await registerDynamicClient({
        adapter: adapterReturning(403, { error: "access_denied", error_description: "off" }),
        auth_server_uri: AUTH_SERVER,
        metadata: REQUEST,
      });
      throw new Error("expected rejection");
    } catch (e: unknown) {
      expect(e).toBeInstanceOf(DynamicClientRegistrationFailedError);
      const failure = e as DynamicClientRegistrationFailedError;
      expect(failure.status).toBe(403);
      expect(failure.isRfc7591Error()).toBe(false);
    }
  });

  test("rejects a malformed success body and an empty redirect_uris list", async () => {
    await expect(
      registerDynamicClient({
        adapter: adapterReturning(201, { client_id: "" }),
        auth_server_uri: AUTH_SERVER,
        metadata: REQUEST,
      }),
    ).rejects.toThrow("malformed");
    await expect(
      registerDynamicClient({
        adapter: adapterReturning(201, {}),
        auth_server_uri: AUTH_SERVER,
        metadata: { redirect_uris: [] },
      }),
    ).rejects.toThrow(TypeError);
  });
});
