// Shared plumbing of the hosting app's same-origin auth session routes.
//
// Browsers drop the HTTP-only refresh-token cookie the auth server sets when
// the app is on another site (it is a third-party cookie: Safari and every
// iOS browser block those), and keeping the refresh token in localStorage
// hands it to any script on the page. These routes keep it in an HTTP-only
// cookie on the APP's own domain instead: a first-party cookie, which every
// browser keeps. The browser SDK sends its token, whoami and logout requests
// to the app's token, whoami and logout routes (`AUTH_SESSION_ROUTE_PATHS`
// for the ones codegen writes); each route forwards its request to the auth
// server server-to-server, presenting the refresh token itself and never
// returning it to the page.
import {
  type AppId,
  type SchemaVaultsAppEnvironment,
  getAppEnvironment,
  getAuthServerUrl,
} from "@schemavaults/app-definitions";
import getSchemavaultsClientApplicationId from "@/env/get-schemavaults-client-application-id";
import {
  AuthSessionRefreshTokenCookieName,
  type SessionCookieAttributes,
  readCookie,
} from "./session-cookie";

type FetchInit = NonNullable<Parameters<typeof fetch>[1]>;
type HeadersInit = ConstructorParameters<typeof Headers>[0];

/** How the routes call the auth server (a `fetch`). */
export type AuthSessionUpstreamFetch = (url: string, init: FetchInit) => Promise<Response>;

export interface AuthSessionRouteOptions {
  /** The client app whose session the routes keep. Default: `SCHEMAVAULTS_CLIENT_APP_ID`. */
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
  /**
   * `Path` of the session cookie: a path prefix of all three session routes,
   * so the browser sends the cookie to each of them (and nowhere else).
   * Default: the parent path of the route serving the request
   * (`/auth/session` for `/auth/session/token`), right when the three routes
   * share a parent, as codegen's do. Give every route the same value.
   */
  cookie_path?: string;
}

/** A route handler: a Web `Request → Response` function. */
export type AuthSessionRouteHandler = (request: Request) => Promise<Response>;

export interface SessionRouteConfig {
  client_app_id: AppId;
  auth_server_url: string;
}

export interface SessionCookie {
  name: string;
  attrs: SessionCookieAttributes;
}

/** What a route's own logic receives once the request passed the shared checks. */
export interface SessionRouteRequest {
  request: Request;
  config: SessionRouteConfig;
  cookie: SessionCookie;
  /** The refresh token in the session cookie, if any. */
  refresh_token: string | null;
  /** Calls the auth server (no caching, no redirects, with a timeout). */
  callAuthServer: (url: string, init: FetchInit) => Promise<Response>;
}

const NO_STORE: Readonly<Record<string, string>> = {
  "Cache-Control": "no-store",
  Pragma: "no-cache",
};

export function noStoreHeaders(headers: HeadersInit = {}): Headers {
  const response_headers = new Headers(headers);
  for (const [name, value] of Object.entries(NO_STORE)) {
    response_headers.set(name, value);
  }
  return response_headers;
}

export function json(status: number, body: unknown, headers: HeadersInit = {}): Response {
  const response_headers: Headers = noStoreHeaders(headers);
  response_headers.set("Content-Type", "application/json");
  return new Response(JSON.stringify(body), { status, headers: response_headers });
}

/** `<auth server>/api/auth/<endpoint>/<client app id>`. */
export function authServerAppEndpoint(
  config: SessionRouteConfig,
  endpoint: "whoami" | "logout",
): string {
  return `${config.auth_server_url.replace(/\/+$/, "")}/api/auth/${endpoint}/${config.client_app_id}`;
}

/** Headers presenting the session's refresh token to the auth server, with the page's Origin. */
export function bearerHeaders(request: Request, refresh_token: string): Headers {
  const headers = new Headers({ Authorization: `Bearer ${refresh_token}`, Accept: "application/json" });
  const origin: string | null = request.headers.get("origin");
  if (origin) headers.set("Origin", origin);
  return headers;
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
 * Cross-site request forgery guard: the routes act with an ambient cookie,
 * so they only answer the app's own pages. The cookie is `SameSite=Strict`
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

/**
 * The session routes' common parent path (`/auth/session` for
 * `/auth/session/token`): the cookie's default `Path`, so the browser sends
 * it to all three routes and nowhere else.
 */
function sessionRoutesPath(pathname: string): string {
  const trimmed: string = pathname.replace(/\/+$/, "");
  return trimmed.slice(0, trimmed.lastIndexOf("/")) || "/";
}

/**
 * Wraps one session route's logic with what every route shares: the
 * same-origin check, the configuration (resolved per request: environment
 * variables may be unset while a framework builds the route module), the
 * session cookie and the upstream fetch.
 */
export function createSessionRoute(
  options: AuthSessionRouteOptions,
  handle: (route: SessionRouteRequest) => Promise<Response>,
): AuthSessionRouteHandler {
  const upstream_fetch: AuthSessionUpstreamFetch =
    options.fetch ?? ((url, init) => fetch(url, init));
  const timeout_ms: number = options.upstream_timeout_ms ?? 30_000;

  async function callAuthServer(url: string, init: FetchInit): Promise<Response> {
    return await upstream_fetch(url, {
      ...init,
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(timeout_ms),
    });
  }

  return async function sessionRoute(request: Request): Promise<Response> {
    if (!isSameOriginRequest(request)) {
      return json(403, { success: false, error: "forbidden", message: "Cross-origin requests are refused" });
    }
    const environment: SchemaVaultsAppEnvironment = options.environment ?? getAppEnvironment();
    const secure: boolean = environment !== "development" && environment !== "test";
    const config: SessionRouteConfig = {
      client_app_id: options.client_app_id ?? getSchemavaultsClientApplicationId(),
      auth_server_url: options.auth_server_url ?? getAuthServerUrl(environment),
    };
    const cookie: SessionCookie = {
      name: AuthSessionRefreshTokenCookieName(config.client_app_id, secure),
      attrs: {
        path: options.cookie_path ?? sessionRoutesPath(new URL(request.url).pathname),
        secure,
      },
    };
    return await handle({
      request,
      config,
      cookie,
      refresh_token: readCookie(request.headers.get("cookie"), cookie.name),
      callAuthServer,
    });
  };
}
