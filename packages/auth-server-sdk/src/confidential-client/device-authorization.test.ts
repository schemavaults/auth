import { describe, expect, test } from "bun:test";
import { oidcScopes } from "@schemavaults/auth-common";
import { startDeviceAuthorization } from "./start-device-authorization";
import {
  pollDeviceAuthorization,
  requestDeviceAccessToken,
} from "./poll-device-authorization";
import { OAuthEndpointError } from "./shared";

const AUTH_SERVER_URL = "https://auth.example.com" as const;
const CLIENT_ID = "22222222-2222-4222-8222-222222222222" as const;
const CLIENT_SECRET = "s3cr3t" as const;
const DEVICE_CODE_GRANT = "urn:ietf:params:oauth:grant-type:device_code";

type FetchInit = Parameters<typeof fetch>[1];

interface CapturedRequest {
  url: string;
  form: URLSearchParams;
  authorization: string | null;
}

/** A `fetch` stub answering with `responses` in turn, recording each request. */
function sequenceFetch(responses: { status: number; body: unknown }[]): {
  fetch: typeof fetch;
  requests: CapturedRequest[];
} {
  const requests: CapturedRequest[] = [];
  const stub = (async (input: string | URL | Request, init?: FetchInit) => {
    requests.push({
      url: String(input),
      form: new URLSearchParams(String(init?.body ?? "")),
      authorization: new Headers(init?.headers).get("Authorization"),
    });
    const next = responses.shift();
    if (!next) throw new Error("Unexpected request");
    return new Response(JSON.stringify(next.body), {
      status: next.status,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  return { fetch: stub, requests };
}

const credentials = (fetch: typeof globalThis.fetch) => ({
  auth_server_url: AUTH_SERVER_URL,
  client_id: CLIENT_ID,
  client_secret: CLIENT_SECRET,
  fetch,
});

const DEVICE_AUTHORIZATION = {
  device_code: "the-device-code",
  user_code: "BCDF-GHJK",
  verification_uri: `${AUTH_SERVER_URL}/device`,
  verification_uri_complete: `${AUTH_SERVER_URL}/device?user_code=BCDF-GHJK`,
  expires_in: 900,
  interval: 5,
} as const;

const TOKENS = {
  access_token: "at",
  token_type: "Bearer",
  expires_in: 300,
  refresh_token: "rt",
  scope: "openid email",
  id_token: "id",
} as const;

describe("startDeviceAuthorization", () => {
  test("POSTs to the device authorization endpoint with client_secret_basic", async () => {
    const { fetch, requests } = sequenceFetch([{ status: 200, body: DEVICE_AUTHORIZATION }]);
    const result = await startDeviceAuthorization({
      ...credentials(fetch),
      scope: [oidcScopes.openid, "email"],
      resource: "https://api.example.com",
    });
    expect(result).toEqual(DEVICE_AUTHORIZATION);
    expect(requests).toHaveLength(1);
    expect(requests[0]!.url).toBe(`${AUTH_SERVER_URL}/api/oidc/device_authorization`);
    expect(requests[0]!.authorization).toStartWith("Basic ");
    expect(requests[0]!.form.get("scope")).toBe("openid email");
    expect(requests[0]!.form.get("resource")).toBe("https://api.example.com");
  });

  test("refuses with the auth server's OAuth error", async () => {
    const { fetch } = sequenceFetch([
      { status: 400, body: { error: "unauthorized_client", error_description: "not enabled" } },
    ]);
    const failure = await startDeviceAuthorization(credentials(fetch)).catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(OAuthEndpointError);
    expect((failure as OAuthEndpointError).error).toBe("unauthorized_client");
  });
});

describe("requestDeviceAccessToken", () => {
  test("reports pending and slow_down, then the tokens", async () => {
    const { fetch, requests } = sequenceFetch([
      { status: 400, body: { error: "authorization_pending" } },
      { status: 400, body: { error: "slow_down" } },
      { status: 200, body: TOKENS },
    ]);
    const options = { ...credentials(fetch), device_code: "the-device-code" };
    expect(await requestDeviceAccessToken(options)).toEqual({ status: "authorization_pending" });
    expect(await requestDeviceAccessToken(options)).toEqual({ status: "slow_down" });
    expect(await requestDeviceAccessToken(options)).toEqual({ status: "tokens", tokens: TOKENS });
    for (const request of requests) {
      expect(request.url).toBe(`${AUTH_SERVER_URL}/api/oidc/token`);
      expect(request.form.get("grant_type")).toBe(DEVICE_CODE_GRANT);
      expect(request.form.get("device_code")).toBe("the-device-code");
    }
  });

  test("throws on a denial", async () => {
    const { fetch } = sequenceFetch([{ status: 400, body: { error: "access_denied" } }]);
    const failure = await requestDeviceAccessToken({
      ...credentials(fetch),
      device_code: "the-device-code",
    }).catch((e: unknown) => e);
    expect((failure as OAuthEndpointError).error).toBe("access_denied");
  });

  test("refuses an empty device code without a request", async () => {
    const { fetch, requests } = sequenceFetch([]);
    await expect(
      requestDeviceAccessToken({ ...credentials(fetch), device_code: "" }),
    ).rejects.toThrow(TypeError);
    expect(requests).toHaveLength(0);
  });
});

describe("pollDeviceAuthorization", () => {
  test("polls until the user approves", async () => {
    const { fetch, requests } = sequenceFetch([
      { status: 400, body: { error: "authorization_pending" } },
      { status: 200, body: TOKENS },
    ]);
    const tokens = await pollDeviceAuthorization({
      ...credentials(fetch),
      device_code: "the-device-code",
      interval: 0.001,
    });
    expect(tokens).toEqual(TOKENS);
    expect(requests).toHaveLength(2);
  });

  test("ends with expired_token", async () => {
    const { fetch } = sequenceFetch([{ status: 400, body: { error: "expired_token" } }]);
    const failure = await pollDeviceAuthorization({
      ...credentials(fetch),
      device_code: "the-device-code",
      interval: 0.001,
    }).catch((e: unknown) => e);
    expect((failure as OAuthEndpointError).error).toBe("expired_token");
  });

  test("stops when aborted", async () => {
    const { fetch, requests } = sequenceFetch([]);
    const controller = new AbortController();
    controller.abort(new Error("cancelled on the device"));
    const failure = await pollDeviceAuthorization({
      ...credentials(fetch),
      device_code: "the-device-code",
      signal: controller.signal,
    }).catch((e: unknown) => e);
    expect((failure as Error).message).toBe("cancelled on the device");
    expect(requests).toHaveLength(0);
  });

  test("refuses a non-positive interval", async () => {
    const { fetch } = sequenceFetch([]);
    await expect(
      pollDeviceAuthorization({ ...credentials(fetch), device_code: "x", interval: 0 }),
    ).rejects.toThrow(TypeError);
  });
});
