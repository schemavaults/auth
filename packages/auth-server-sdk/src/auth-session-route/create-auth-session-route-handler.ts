// The hosting app's same-origin auth session route.
//
// Browsers drop the HTTP-only refresh-token cookie the auth server sets when
// the app is on another site (it is a third-party cookie: Safari and every
// iOS browser block those), and keeping the refresh token in localStorage
// hands it to any script on the page. This route keeps it in an HTTP-only
// cookie on the APP's own domain instead: a first-party cookie, which every
// browser keeps. The browser SDK sends its token, whoami and logout requests
// here (`<route>/token`, `<route>/whoami`, `<route>/logout`); the route
// forwards them to the auth server server-to-server, presenting the refresh
// token itself and never returning it to the page.
import {
  type AppId,
  type SchemaVaultsAppEnvironment,
  getAppEnvironment,
  getAuthServerUrl,
} from "@schemavaults/app-definitions";
import {
  MaximumBrowserCookieSize,
  OIDC_TOKEN_REFRESH_TOKEN_DELIVERY_PARAM,
  getOidcEndpointUrl,
} from "@schemavaults/auth-common";
import getSchemavaultsClientApplicationId from "@/env/get-schemavaults-client-application-id";
import getStringByteSize from "@/getStringByteSize";
import {
  AuthSessionRefreshTokenCookieName,
  type SessionCookieAttributes,
  readCookie,
  serializeClearedSessionCookie,
  serializeSessionCookie,
} from "./session-cookie";

type FetchInit = NonNullable<Parameters<typeof fetch>[1]>;

/** How the route calls the auth server (a `fetch`). */
export type AuthSessionUpstreamFetch = (url: string, init: FetchInit) => Promise<Response>;

export interface AuthSessionRouteHandlerOptions {
  /** The client app whose session the route keeps. Default: `SCHEMAVAULTS_CLIENT_APP_ID`. */
  client_app_id?: AppId;
  /**
   * The auth server's URL. Default: `SCHEMAVAULTS_AUTH_SERVER_URL`, else the
   * environment's default auth server (as the browser SDK resolves it).
   */
  auth_server_url?: string;
  /** Default: `SCHEMAVAULTS_APP_ENVIRONMENT`. Outside development/test the cookie is `Secure`. */
  environment?: SchemaVaultsAppEnvironment;
  /** Upstream fetch (tests). */
  fetch?: AuthSessionUpstreamFetch;
  /** Timeout of each request to the auth server, in milliseconds (default 30s). */
  upstream_timeout_ms?: number;
}

export type AuthSessionRouteHandler = (request: Request) => Promise<Response>;

export const AUTH_SESSION_ROUTE_ACTIONS = ["token", "whoami", "logout"] as const;
export type AuthSessionRouteAction = (typeof AUTH_SESSION_ROUTE_ACTIONS)[number];

const ACTION_METHODS: Readonly<Record<AuthSessionRouteAction, "GET" | "POST">> = {
  token: "POST",
  whoami: "GET",
  logout: "POST",
};

const NO_STORE: Readonly<Record<string, string>> = {
  "Cache-Control": "no-store",
  Pragma: "no-cache",
};

interface ResolvedConfig {
  client_app_id: AppId;
  auth_server_url: string;
  secure: boolean;
}

type HeadersInit = ConstructorParameters<typeof Headers>[0];

function json(status: number, body: unknown, headers: HeadersInit = {}): Response {
  const response_headers = new Headers(headers);
  response_headers.set("Content-Type", "application/json");
  for (const [name, value] of Object.entries(NO_STORE)) {
    response_headers.set(name, value);
  }
  return new Response(JSON.stringify(body), { status, headers: response_headers });
}

function oauthError(status: number, error: string, error_description: string): Response {
  return json(status, { error, error_description });
}

/** The host the browser addressed (behind a proxy, its forwarded host). */
function requestHost(request: Request): string {
  const forwarded: string | undefined = request.headers
    .get("x-forwarded-host")
    ?.split(",")[0]
    ?.trim();
  return (forwarded || request.headers.get("host") || new URL(request.url).host).toLowerCase();
}

/**
 * Cross-site request forgery guard: the route acts with an ambient cookie,
 * so it only answers the app's own pages. The cookie is `SameSite=Strict`
 * too; this also refuses same-site requests from another origin.
 */
function isSameOriginRequest(request: Request): boolean {
  const fetch_site: string | null = request.headers.get("sec-fetch-site");
  if (fetch_site !== null && fetch_site !== "same-origin") {
    return false;
  }
  const origin: string | null = request.headers.get("origin");
  if (origin === null) {
    // Browsers always send Origin on POST; same-origin GETs may omit it.
    return request.method === "GET";
  }
  try {
    return new URL(origin).host.toLowerCase() === requestHost(request);
  } catch {
    return false;
  }
}

function parseAction(pathname: string): { action: string; base_path: string } {
  const trimmed: string = pathname.replace(/\/+$/, "");
  const separator: number = trimmed.lastIndexOf("/");
  return {
    action: trimmed.slice(separator + 1),
    base_path: trimmed.slice(0, separator) || "/",
  };
}

/**
 * Creates the handler of the app's auth session route, a Web
 * `Request → Response` function serving `<route>/token` (POST),
 * `<route>/whoami` (GET) and `<route>/logout` (POST). Mount it on a
 * catch-all of the route's base path, e.g. in Next.js
 * `app/auth/session/[action]/route.ts`:
 *
 * ```ts
 * const handler = createAuthSessionRouteHandler();
 * export { handler as GET, handler as POST };
 * ```
 *
 * and point the browser SDK at it (`session_route_uri="/auth/session"` on
 * `<AuthProvider>`).
 */
export function createAuthSessionRouteHandler(
  options: AuthSessionRouteHandlerOptions = {},
): AuthSessionRouteHandler {
  const upstream_fetch: AuthSessionUpstreamFetch =
    options.fetch ?? ((url, init) => fetch(url, init));
  const timeout_ms: number = options.upstream_timeout_ms ?? 30_000;

  // Resolved per request: environment variables may be unset while a
  // framework builds the route module.
  function resolveConfig(): ResolvedConfig {
    const environment: SchemaVaultsAppEnvironment =
      options.environment ?? getAppEnvironment();
    return {
      client_app_id: options.client_app_id ?? getSchemavaultsClientApplicationId(),
      auth_server_url: options.auth_server_url ?? getAuthServerUrl(environment),
      secure: environment !== "development" && environment !== "test",
    };
  }

  async function callAuthServer(url: string, init: FetchInit): Promise<Response> {
    return await upstream_fetch(url, {
      ...init,
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(timeout_ms),
    });
  }

  async function handleToken(
    request: Request,
    config: ResolvedConfig,
    cookie: { name: string; attrs: SessionCookieAttributes },
  ): Promise<Response> {
    const form = new URLSearchParams(await request.text());
    if (form.get("client_id") !== config.client_app_id) {
      return oauthError(400, "invalid_client", "This session route serves another client.");
    }
    const grant_type: string | null = form.get("grant_type");
    // The auth server answers this route inline; the route alone decides
    // where the refresh token goes.
    form.delete(OIDC_TOKEN_REFRESH_TOKEN_DELIVERY_PARAM);
    form.delete("client_secret");
    if (grant_type === "refresh_token") {
      const refresh_token: string | null = readCookie(request.headers.get("cookie"), cookie.name);
      if (!refresh_token) {
        return oauthError(400, "invalid_grant", "No session: sign in again.");
      }
      form.set("refresh_token", refresh_token);
    } else if (grant_type === "authorization_code") {
      form.delete("refresh_token");
    } else {
      return oauthError(400, "unsupported_grant_type", "Only authorization_code and refresh_token grants are served here.");
    }

    const headers = new Headers({
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    });
    const origin: string | null = request.headers.get("origin");
    if (origin) headers.set("Origin", origin);

    let upstream: Response;
    let body: Record<string, unknown>;
    try {
      upstream = await callAuthServer(getOidcEndpointUrl(config.auth_server_url, "token"), {
        method: "POST",
        headers,
        body: form.toString(),
      });
      const parsed: unknown = JSON.parse(await upstream.text());
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        throw new TypeError("token response is not a JSON object");
      }
      body = parsed as Record<string, unknown>;
    } catch (e: unknown) {
      console.error("[auth-session-route] Token request to the auth server failed:", e);
      return oauthError(502, "temporarily_unavailable", "The auth server could not be reached.");
    }

    const response_headers = new Headers();
    for (const name of ["WWW-Authenticate", "Retry-After"]) {
      const value: string | null = upstream.headers.get(name);
      if (value) response_headers.set(name, value);
    }

    if (upstream.ok && typeof body.refresh_token === "string") {
      const refresh_token: string = body.refresh_token;
      delete body.refresh_token;
      if (getStringByteSize(refresh_token) > MaximumBrowserCookieSize) {
        console.error("[auth-session-route] The refresh token does not fit in a cookie.");
        return oauthError(500, "server_error", "The session could not be stored.");
      }
      const expires_in: number =
        typeof body.refresh_token_expires_in === "number" ? body.refresh_token_expires_in : 0;
      response_headers.append(
        "Set-Cookie",
        serializeSessionCookie(cookie.name, refresh_token, expires_in, cookie.attrs),
      );
    } else if (grant_type === "refresh_token" && body.error === "invalid_grant") {
      response_headers.append("Set-Cookie", serializeClearedSessionCookie(cookie.name, cookie.attrs));
    }
    return json(upstream.status, body, response_headers);
  }

  async function handleWhoami(
    request: Request,
    config: ResolvedConfig,
    cookie: { name: string; attrs: SessionCookieAttributes },
  ): Promise<Response> {
    const refresh_token: string | null = readCookie(request.headers.get("cookie"), cookie.name);
    if (!refresh_token) {
      return json(401, { success: false, error: "unauthorized", message: "Authentication required" });
    }
    const headers = new Headers({ Authorization: `Bearer ${refresh_token}`, Accept: "application/json" });
    const origin: string | null = request.headers.get("origin");
    if (origin) headers.set("Origin", origin);
    let upstream: Response;
    let text: string;
    try {
      upstream = await callAuthServer(
        `${config.auth_server_url.replace(/\/+$/, "")}/api/auth/whoami/${config.client_app_id}`,
        { method: "GET", headers },
      );
      text = await upstream.text();
    } catch (e: unknown) {
      console.error("[auth-session-route] whoami request to the auth server failed:", e);
      return json(502, { success: false, error: "bad_gateway", message: "The auth server could not be reached." });
    }
    const response_headers = new Headers({
      "Content-Type": upstream.headers.get("content-type") ?? "application/json",
      ...NO_STORE,
    });
    if (upstream.status === 401) {
      // The refresh token no longer verifies (revoked, expired): the session is over.
      response_headers.append("Set-Cookie", serializeClearedSessionCookie(cookie.name, cookie.attrs));
    }
    return new Response(text, { status: upstream.status, headers: response_headers });
  }

  async function handleLogout(
    request: Request,
    config: ResolvedConfig,
    cookie: { name: string; attrs: SessionCookieAttributes },
  ): Promise<Response> {
    const refresh_token: string | null = readCookie(request.headers.get("cookie"), cookie.name);
    if (refresh_token) {
      // Revokes the refresh token and the access tokens minted with it.
      const headers = new Headers({ Authorization: `Bearer ${refresh_token}`, Accept: "application/json" });
      const origin: string | null = request.headers.get("origin");
      if (origin) headers.set("Origin", origin);
      try {
        const upstream: Response = await callAuthServer(
          `${config.auth_server_url.replace(/\/+$/, "")}/api/auth/logout/${config.client_app_id}`,
          { method: "POST", headers },
        );
        if (!upstream.ok) {
          console.error(`[auth-session-route] The auth server answered the logout with HTTP ${upstream.status}`);
        }
      } catch (e: unknown) {
        console.error("[auth-session-route] Logout request to the auth server failed:", e);
      }
    }
    return json(
      200,
      { success: true, error: false, message: "Logged out" },
      { "Set-Cookie": serializeClearedSessionCookie(cookie.name, cookie.attrs) },
    );
  }

  return async function authSessionRoute(request: Request): Promise<Response> {
    const { action, base_path } = parseAction(new URL(request.url).pathname);
    if (!(AUTH_SESSION_ROUTE_ACTIONS as readonly string[]).includes(action)) {
      return json(404, { success: false, error: "not_found", message: "Unknown auth session action" });
    }
    const route_action = action as AuthSessionRouteAction;
    const method: "GET" | "POST" = ACTION_METHODS[route_action];
    if (request.method !== method) {
      return json(405, { success: false, error: "method_not_allowed", message: `Use ${method}` }, { Allow: method });
    }
    if (!isSameOriginRequest(request)) {
      return json(403, { success: false, error: "forbidden", message: "Cross-origin requests are refused" });
    }

    const config: ResolvedConfig = resolveConfig();
    const cookie = {
      name: AuthSessionRefreshTokenCookieName(config.client_app_id, config.secure),
      attrs: { path: base_path, secure: config.secure },
    };
    switch (route_action) {
      case "token":
        return await handleToken(request, config, cookie);
      case "whoami":
        return await handleWhoami(request, config, cookie);
      case "logout":
        return await handleLogout(request, config, cookie);
    }
  };
}

export default createAuthSessionRouteHandler;
