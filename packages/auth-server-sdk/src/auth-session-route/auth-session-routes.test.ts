import { afterEach, beforeEach, describe, expect, spyOn, test, type Mock } from "bun:test";
import {
  type AuthSessionRouteHandler,
  type AuthSessionRouteOptions,
  type AuthSessionUpstreamFetch,
  createAuthSessionLogoutRoute,
  createAuthSessionTokenRoute,
  createAuthSessionWhoamiRoute,
} from "./index";

const APP = "my-game";
const APP_ORIGIN = "https://game.example.ca";
const AUTH = "https://auth.example.com";
const COOKIE = `__Secure-schemavaults_refresh_token_${APP}`;

interface UpstreamCall {
  url: string;
  method: string;
  headers: Headers;
  body: string | null;
}

function upstreamAnswering(...responses: Response[]) {
  const calls: UpstreamCall[] = [];
  const fetch = (async (input: unknown, init?: Parameters<typeof globalThis.fetch>[1]) => {
    calls.push({
      url: String(input),
      method: init?.method ?? "GET",
      headers: new Headers(init?.headers),
      body: typeof init?.body === "string" ? init.body : null,
    });
    const next = responses.shift();
    if (!next) throw new Error("unexpected upstream call");
    return next;
  }) as AuthSessionUpstreamFetch;
  return { calls, fetch };
}

type Action = "token" | "whoami" | "logout";

function options(
  fetch: AuthSessionUpstreamFetch,
  overrides: Partial<AuthSessionRouteOptions> = {},
): AuthSessionRouteOptions {
  return { client_app_id: APP, auth_server_url: AUTH, environment: "production", fetch, ...overrides };
}

/** The route that serves `action`, as its own route file mounts it. */
function route(
  action: Action,
  fetch: AuthSessionUpstreamFetch,
  overrides: Partial<AuthSessionRouteOptions> = {},
): AuthSessionRouteHandler {
  switch (action) {
    case "token":
      return createAuthSessionTokenRoute(options(fetch, overrides)).POST;
    case "whoami":
      return createAuthSessionWhoamiRoute(options(fetch, overrides)).GET;
    case "logout":
      return createAuthSessionLogoutRoute(options(fetch, overrides)).POST;
  }
}

async function bodyOf(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function pageRequest(
  action: Action,
  init: { body?: string; cookie?: string; headers?: Record<string, string> } = {},
): Request {
  const method: string = action === "whoami" ? "GET" : "POST";
  const headers = new Headers({ Host: "game.example.ca", "Sec-Fetch-Site": "same-origin", ...init.headers });
  if (method === "POST" && !headers.has("Origin")) headers.set("Origin", APP_ORIGIN);
  if (init.cookie) headers.set("Cookie", init.cookie);
  return new Request(`${APP_ORIGIN}/auth/session/${action}`, { method, headers, body: init.body });
}

function form(fields: Record<string, string>): string {
  return new URLSearchParams(fields).toString();
}

const ISSUED = {
  access_token: "access-1",
  token_type: "Bearer",
  expires_in: 900,
  refresh_token: "refresh-1",
  refresh_token_expires_in: 2_592_000,
  id_token: "id-token",
};

describe("auth session routes", () => {
  let consoleError: Mock<typeof console.error>;
  beforeEach(() => {
    consoleError = spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    consoleError.mockRestore();
  });

  test("code grant: keeps the refresh token in a first-party HTTP-only cookie, never in the body", async () => {
    const { calls, fetch } = upstreamAnswering(jsonResponse(200, ISSUED));
    const response = await route("token", fetch)(
      pageRequest("token", {
        body: form({
          grant_type: "authorization_code",
          client_id: APP,
          code: "the-code",
          code_verifier: "verifier",
          redirect_uri: `${APP_ORIGIN}/auth/authorize`,
          refresh_token_delivery: "http_only_cookie",
        }),
      }),
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`${AUTH}/api/oidc/token`);
    const sent = new URLSearchParams(calls[0]?.body ?? "");
    expect(sent.get("code")).toBe("the-code");
    expect(sent.has("refresh_token_delivery")).toBe(false);
    expect(calls[0]?.headers.get("Origin")).toBe(APP_ORIGIN);

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const body = await bodyOf(response);
    expect(body).not.toHaveProperty("refresh_token");
    expect(body.access_token).toBe("access-1");
    expect(body.id_token).toBe("id-token");
    expect(body.refresh_token_expires_in).toBe(2_592_000);
    expect(response.headers.get("Set-Cookie")).toBe(
      `${COOKIE}=refresh-1; Max-Age=2592000; Path=/auth/session; HttpOnly; SameSite=Strict; Secure`,
    );
  });

  test("refresh grant: presents the cookie's refresh token (never the page's) and rotates the cookie", async () => {
    const { calls, fetch } = upstreamAnswering(
      jsonResponse(200, { ...ISSUED, refresh_token: "refresh-2", id_token: undefined }),
    );
    const response = await route("token", fetch)(
      pageRequest("token", {
        cookie: `other=1; ${COOKIE}=refresh-1`,
        body: form({ grant_type: "refresh_token", client_id: APP, refresh_token: "from-the-page", resource: "game-api" }),
      }),
    );
    const sent = new URLSearchParams(calls[0]?.body ?? "");
    expect(sent.get("refresh_token")).toBe("refresh-1");
    expect(sent.get("resource")).toBe("game-api");
    expect(response.status).toBe(200);
    expect(await bodyOf(response)).not.toHaveProperty("refresh_token");
    expect(response.headers.get("Set-Cookie")).toStartWith(`${COOKIE}=refresh-2;`);
  });

  test("refresh grant without a session answers invalid_grant without calling the auth server", async () => {
    const { calls, fetch } = upstreamAnswering();
    const response = await route("token", fetch)(
      pageRequest("token", { body: form({ grant_type: "refresh_token", client_id: APP }) }),
    );
    expect(calls).toHaveLength(0);
    expect(response.status).toBe(400);
    expect((await bodyOf(response)).error).toBe("invalid_grant");
  });

  test("a refused refresh token ends the session cookie", async () => {
    const { fetch } = upstreamAnswering(
      jsonResponse(400, { error: "invalid_grant", error_description: "Refresh token has been revoked." }),
    );
    const response = await route("token", fetch)(
      pageRequest("token", { cookie: `${COOKIE}=refresh-1`, body: form({ grant_type: "refresh_token", client_id: APP }) }),
    );
    expect(response.status).toBe(400);
    expect((await bodyOf(response)).error).toBe("invalid_grant");
    expect(response.headers.get("Set-Cookie")).toStartWith(`${COOKIE}=; Max-Age=0;`);
  });

  test("serves only its own app and the code / refresh grants", async () => {
    const { calls, fetch } = upstreamAnswering();
    const other_app = await route("token", fetch)(
      pageRequest("token", { body: form({ grant_type: "authorization_code", client_id: "other-app", code: "c" }) }),
    );
    expect(other_app.status).toBe(400);
    expect((await bodyOf(other_app)).error).toBe("invalid_client");
    const client_credentials = await route("token", fetch)(
      pageRequest("token", { body: form({ grant_type: "client_credentials", client_id: APP }) }),
    );
    expect(client_credentials.status).toBe(400);
    expect((await bodyOf(client_credentials)).error).toBe("unsupported_grant_type");
    expect(calls).toHaveLength(0);
  });

  test("refuses cross-origin requests", async () => {
    const { calls, fetch } = upstreamAnswering();
    const body = form({ grant_type: "refresh_token", client_id: APP });
    const cookie = `${COOKIE}=refresh-1`;
    for (const [action, request] of [
      ["token", pageRequest("token", { body, cookie, headers: { Origin: "https://evil.example" } })],
      ["token", pageRequest("token", { body, cookie, headers: { "Sec-Fetch-Site": "same-site" } })],
      ["whoami", pageRequest("whoami", { cookie, headers: { "Sec-Fetch-Site": "cross-site" } })],
      ["logout", pageRequest("logout", { cookie, headers: { "Sec-Fetch-Site": "cross-site" } })],
      [
        "token",
        new Request(`${APP_ORIGIN}/auth/session/token`, {
          method: "POST",
          headers: { Host: "game.example.ca", Cookie: cookie },
          body,
        }),
      ],
    ] as const) {
      expect((await route(action, fetch)(request)).status, action).toBe(403);
    }
    expect(calls).toHaveLength(0);
  });

  test("honours the forwarded host behind a proxy", async () => {
    const { fetch } = upstreamAnswering(jsonResponse(200, ISSUED));
    const response = await route("token", fetch)(
      pageRequest("token", {
        headers: { Host: "127.0.0.1:3000", "X-Forwarded-Host": "game.example.ca" },
        body: form({ grant_type: "authorization_code", client_id: APP, code: "c" }),
      }),
    );
    expect(response.status).toBe(200);
  });

  test("whoami presents the refresh token as a Bearer and ends a session the auth server refuses", async () => {
    const user = { success: true, user: { uid: "u1" } };
    const { calls, fetch } = upstreamAnswering(
      jsonResponse(200, user),
      jsonResponse(401, { success: false, error: "unauthorized" }),
    );
    const whoami = route("whoami", fetch);

    const ok = await whoami(pageRequest("whoami", { cookie: `${COOKIE}=refresh-1` }));
    expect(calls[0]?.url).toBe(`${AUTH}/api/auth/whoami/${APP}`);
    expect(calls[0]?.headers.get("Authorization")).toBe("Bearer refresh-1");
    expect(ok.status).toBe(200);
    expect(await bodyOf(ok)).toEqual(user);
    expect(ok.headers.get("Set-Cookie")).toBeNull();

    const refused = await whoami(pageRequest("whoami", { cookie: `${COOKIE}=refresh-1` }));
    expect(refused.status).toBe(401);
    expect(refused.headers.get("Set-Cookie")).toStartWith(`${COOKIE}=; Max-Age=0; Path=/auth/session;`);

    const signed_out = await whoami(pageRequest("whoami"));
    expect(signed_out.status).toBe(401);
    expect(calls).toHaveLength(2);
  });

  test("logout revokes the session at the auth server and clears the cookie", async () => {
    const { calls, fetch } = upstreamAnswering(jsonResponse(200, { success: true }));
    const response = await route("logout", fetch)(pageRequest("logout", { cookie: `${COOKIE}=refresh-1` }));
    expect(calls[0]?.url).toBe(`${AUTH}/api/auth/logout/${APP}`);
    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.headers.get("Authorization")).toBe("Bearer refresh-1");
    expect(calls[0]?.headers.get("Origin")).toBe(APP_ORIGIN);
    expect(response.status).toBe(200);
    // Path: the routes' common parent, as the token route set it.
    expect(response.headers.get("Set-Cookie")).toStartWith(`${COOKIE}=; Max-Age=0; Path=/auth/session;`);
  });

  test("logout still clears the cookie when the auth server is unreachable", async () => {
    const fetch = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as AuthSessionUpstreamFetch;
    const response = await route("logout", fetch)(pageRequest("logout", { cookie: `${COOKIE}=refresh-1` }));
    expect(response.status).toBe(200);
    expect(response.headers.get("Set-Cookie")).toStartWith(`${COOKIE}=; Max-Age=0;`);
  });

  test("answers 502 with an OAuth error when the auth server cannot be reached", async () => {
    const fetch = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as AuthSessionUpstreamFetch;
    const response = await route("token", fetch)(
      pageRequest("token", { body: form({ grant_type: "authorization_code", client_id: APP, code: "c" }) }),
    );
    expect(response.status).toBe(502);
    expect((await bodyOf(response)).error).toBe("temporarily_unavailable");
  });

  test("an explicit cookie_path covers routes that share no parent", async () => {
    const { fetch } = upstreamAnswering(jsonResponse(200, ISSUED));
    const response = await route("token", fetch, { cookie_path: "/" })(
      pageRequest("token", { body: form({ grant_type: "authorization_code", client_id: APP, code: "c" }) }),
    );
    expect(response.headers.get("Set-Cookie")).toContain("; Path=/; ");
  });

  test("plain-HTTP development cookies drop Secure and the __Secure- prefix", async () => {
    const { fetch } = upstreamAnswering(jsonResponse(200, ISSUED));
    const response = await route("token", fetch, { environment: "development" })(
      pageRequest("token", { body: form({ grant_type: "authorization_code", client_id: APP, code: "c" }) }),
    );
    expect(response.headers.get("Set-Cookie")).toBe(
      `schemavaults_refresh_token_${APP}=refresh-1; Max-Age=2592000; Path=/auth/session; HttpOnly; SameSite=Strict`,
    );
  });
});
