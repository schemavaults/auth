import { describe, expect, test } from "bun:test";
import type { ISchemaVaultsAuthClientAdapter } from "@/types/ISchemaVaultsAuthClientAdapter";
import { TokenEndpointRequestFailedError } from "@/lib/oidc";
import { isExpectedAuthClientError } from "@/lib/telemetry/expected-errors";
import {
  buildDeviceAuthorizationRequestParameters,
  pollDeviceAuthorization,
  requestDeviceAuthorization,
  signInWithDeviceAuthorization,
} from "./index";

const AUTH_SERVER = "https://auth.example.com";

type AdapterFetch = ISchemaVaultsAuthClientAdapter["fetch"];
type Call = { url: string; body: URLSearchParams };

function makeAdapter(fetchImpl: AdapterFetch): ISchemaVaultsAuthClientAdapter {
  return { fetch: fetchImpl } as unknown as ISchemaVaultsAuthClientAdapter;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

function recordingAdapter(responses: Response[]): { adapter: ISchemaVaultsAuthClientAdapter; calls: Call[] } {
  const calls: Call[] = [];
  const adapter = makeAdapter(async (url, init) => {
    calls.push({ url, body: new URLSearchParams(String(init?.body ?? "")) });
    const next = responses.shift();
    if (!next) throw new Error(`Unexpected request to ${url}`);
    return next;
  });
  return { adapter, calls };
}

const DEVICE_AUTHORIZATION = {
  device_code: "device-code-123",
  user_code: "BCDF-GHJK",
  verification_uri: `${AUTH_SERVER}/device`,
  verification_uri_complete: `${AUTH_SERVER}/device?user_code=BCDF-GHJK`,
  expires_in: 900,
  interval: 5,
};

// openid-client waits `interval` seconds before every poll: keep tests fast.
const FAST_POLLING = { ...DEVICE_AUTHORIZATION, interval: 0.001 };

describe("buildDeviceAuthorizationRequestParameters", () => {
  test("serializes the scope and the resource", () => {
    const parameters = buildDeviceAuthorizationRequestParameters({
      scope: ["openid", "email", "notes:read"],
      resource: "https://api.example.com",
    });
    expect(parameters.get("scope")).toBe("openid email notes:read");
    expect(parameters.get("resource")).toBe("https://api.example.com");
  });

  test("omits an empty scope and refuses an empty resource", () => {
    expect(buildDeviceAuthorizationRequestParameters({ scope: "" }).has("scope")).toBe(false);
    expect(() => buildDeviceAuthorizationRequestParameters({ scope: "openid", resource: "" })).toThrow(
      TypeError,
    );
  });
});

describe("requestDeviceAuthorization", () => {
  test("posts the client id and scope to the device authorization endpoint", async () => {
    const { adapter, calls } = recordingAdapter([json(200, DEVICE_AUTHORIZATION)]);
    const response = await requestDeviceAuthorization({
      auth_server_url: AUTH_SERVER,
      client_app_id: "my-cli",
      environment: "production",
      adapter,
      scope: "openid email",
    });
    expect(response.user_code).toBe("BCDF-GHJK");
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(`${AUTH_SERVER}/api/oidc/device_authorization`);
    expect(calls[0]!.body.get("client_id")).toBe("my-cli");
    expect(calls[0]!.body.get("scope")).toBe("openid email");
  });

  test("surfaces the OAuth error of a refused request", async () => {
    const { adapter } = recordingAdapter([
      json(400, { error: "unauthorized_client", error_description: "not enabled" }),
    ]);
    const failure = await requestDeviceAuthorization({
      auth_server_url: AUTH_SERVER,
      client_app_id: "my-cli",
      environment: "production",
      adapter,
      scope: "openid",
    }).catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(TokenEndpointRequestFailedError);
    expect((failure as TokenEndpointRequestFailedError).oauth_error).toBe("unauthorized_client");
  });
});

describe("pollDeviceAuthorization", () => {
  const poll = (adapter: ISchemaVaultsAuthClientAdapter, resource?: string) =>
    pollDeviceAuthorization({
      auth_server_url: AUTH_SERVER,
      client_app_id: "my-cli",
      environment: "production",
      adapter,
      device_authorization: FAST_POLLING,
      ...(resource ? { resource } : {}),
    });

  test("keeps polling while the user has not decided, then returns the tokens", async () => {
    const { adapter, calls } = recordingAdapter([
      json(400, { error: "authorization_pending" }),
      json(400, { error: "authorization_pending" }),
      json(200, { access_token: "at", token_type: "Bearer", expires_in: 300, refresh_token: "rt" }),
    ]);
    const tokens = await poll(adapter, "https://api.example.com");
    expect(tokens.access_token).toBe("at");
    expect(calls).toHaveLength(3);
    for (const call of calls) {
      expect(call.url).toBe(`${AUTH_SERVER}/api/oidc/token`);
      expect(call.body.get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:device_code");
      expect(call.body.get("device_code")).toBe("device-code-123");
      expect(call.body.get("resource")).toBe("https://api.example.com");
    }
  });

  test("a denied request rejects with access_denied, which is not reported as a fault", async () => {
    const { adapter } = recordingAdapter([json(400, { error: "access_denied" })]);
    const failure = await poll(adapter).catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(TokenEndpointRequestFailedError);
    expect((failure as TokenEndpointRequestFailedError).oauth_error).toBe("access_denied");
    expect(isExpectedAuthClientError(failure)).toBe(true);
  });

  test("an expired code rejects with expired_token", async () => {
    const { adapter } = recordingAdapter([json(400, { error: "expired_token" })]);
    const failure = await poll(adapter).catch((e: unknown) => e);
    expect((failure as TokenEndpointRequestFailedError).oauth_error).toBe("expired_token");
    expect(isExpectedAuthClientError(failure)).toBe(true);
  });

  test("other refusals are reported", async () => {
    const { adapter } = recordingAdapter([json(400, { error: "invalid_grant" })]);
    const failure = await poll(adapter).catch((e: unknown) => e);
    expect((failure as TokenEndpointRequestFailedError).oauth_error).toBe("invalid_grant");
    expect(isExpectedAuthClientError(failure)).toBe(false);
  });
});

describe("signInWithDeviceAuthorization", () => {
  test("refuses a scope without openid before contacting the auth server", async () => {
    const { adapter, calls } = recordingAdapter([]);
    const failure = await signInWithDeviceAuthorization({
      options: { scope: "notes:read", onUserCode: () => {} },
      default_scope: "openid",
      defaultTokenAudiences: [],
      auth_server_url: AUTH_SERVER,
      client_app_id: "my-cli",
      environment: "production",
      adapter,
      auth_server_app_id: "auth-app",
      debug: false,
      storeRefreshToken: () => {},
      storeMultipleAccessTokens: () => {},
      exchangeAuthTokens: async () => ({}),
      fetchUserData: async () => null,
      storeUserData: () => {},
      triggerAuthStateChanged: () => {},
    }).catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(TypeError);
    expect(calls).toHaveLength(0);
  });

  test("shows the user code before polling", async () => {
    const order: string[] = [];
    const adapter = makeAdapter(async (url) => {
      order.push(url.endsWith("/device_authorization") ? "request" : "poll");
      // The smallest interval the response schema accepts: one second.
      return url.endsWith("/device_authorization")
        ? json(200, { ...DEVICE_AUTHORIZATION, interval: 1 })
        : json(400, { error: "access_denied" });
    });
    const failure = await signInWithDeviceAuthorization({
      options: {
        onUserCode: (prompt) => {
          order.push(`show ${prompt.user_code} at ${prompt.verification_uri}`);
        },
      },
      default_scope: "openid email",
      defaultTokenAudiences: [],
      auth_server_url: AUTH_SERVER,
      client_app_id: "my-cli",
      environment: "production",
      adapter,
      auth_server_app_id: "auth-app",
      debug: false,
      storeRefreshToken: () => {},
      storeMultipleAccessTokens: () => {},
      exchangeAuthTokens: async () => ({}),
      fetchUserData: async () => null,
      storeUserData: () => {},
      triggerAuthStateChanged: () => {},
    }).catch((e: unknown) => e);
    expect(order).toEqual([
      "request",
      `show BCDF-GHJK at ${AUTH_SERVER}/device`,
      "poll",
    ]);
    expect((failure as TokenEndpointRequestFailedError).oauth_error).toBe("access_denied");
  });
});
