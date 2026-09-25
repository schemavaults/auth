import type { SecuritySchemeObject } from "openapi3-ts/oas31";
import type { OrganizationMembershipRoleType } from "@schemavaults/auth-common/organizations";

/**
 * What kind of principal a scheme's resolver produces:
 *
 * - `"user"`: the credential always identifies a user, so a principal
 *   resolved from it carries a non-null `user`. When every scheme an
 *   operation accepts is a user scheme, its handler sees `ctx.auth.user`
 *   typed as `TUser` (not `TUser | null`), and the runtime fails closed
 *   (401) should a resolver ever return a principal without a user.
 * - `"any"` (the default): the principal may or may not be a user (client
 *   credentials, API keys, ...); handlers narrow `ctx.auth.user` themselves.
 */
export type AuthPrincipalKind = "user" | "any";

export const AUTH_PRINCIPAL_KINDS = ["user", "any"] as const satisfies readonly AuthPrincipalKind[];

export function isValidAuthPrincipalKind(value: unknown): value is AuthPrincipalKind {
  return typeof value === "string" && (AUTH_PRINCIPAL_KINDS as readonly string[]).includes(value);
}

/**
 * A named OpenAPI security scheme (`components.securitySchemes[name]`) plus
 * the metadata the SchemaVaults docs UI uses to explain how to authenticate.
 *
 * The scheme only DESCRIBES how credentials are transported. Verifying them
 * is the job of an {@link AuthResolver} registered with the Hono app under
 * the same `name`, so the same operation definitions can run on the auth
 * server (which can decrypt its own tokens) and on a third-party resource
 * server (which verifies them against the auth server's JWKS).
 */
export interface AuthSchemeDefinition<
  TName extends string = string,
  TPrincipal extends AuthPrincipalKind = AuthPrincipalKind,
> {
  /** Key under `components.securitySchemes` and in `security` requirements. */
  readonly name: TName;
  /** What the resolver of this scheme produces; see {@link AuthPrincipalKind}. Default `"any"`. */
  readonly principal?: TPrincipal;
  /** Human readable label for docs. */
  readonly title: string;
  /** Longer explanation for docs (where to get the credential, lifetime, ...). */
  readonly description?: string;
  /** The OpenAPI 3.1 security scheme object emitted into the document. */
  readonly securityScheme: SecuritySchemeObject;
  /**
   * Value for the `WWW-Authenticate` header of a 401 produced when no
   * credential for this scheme was presented (RFC 7235 §4.1). Optional;
   * schemes without a challenge (cookies, api keys) omit it.
   */
  readonly challenge?: string;
}

export function defineAuthScheme<
  const TName extends string,
  const TPrincipal extends AuthPrincipalKind = "any",
>(definition: AuthSchemeDefinition<TName, TPrincipal>): AuthSchemeDefinition<TName, TPrincipal> {
  if (typeof definition.name !== "string" || definition.name.length === 0) {
    throw new TypeError("An auth scheme needs a non-empty name");
  }
  if (!/^[A-Za-z0-9._-]+$/.test(definition.name)) {
    throw new TypeError(
      `Auth scheme name "${definition.name}" must match /^[A-Za-z0-9._-]+$/ (it becomes an OpenAPI component key)`,
    );
  }
  if (definition.principal !== undefined && !isValidAuthPrincipalKind(definition.principal)) {
    throw new TypeError(
      `Auth scheme "${definition.name}" has an unknown principal kind "${String(definition.principal)}" (expected one of: ${AUTH_PRINCIPAL_KINDS.join(", ")})`,
    );
  }
  return Object.freeze({ ...definition });
}

/** Whether a principal resolved from the scheme is guaranteed to carry a user. */
export function schemeResolvesUser(scheme: AuthSchemeDefinition): boolean {
  return scheme.principal === "user";
}

/** A scheme whose resolver always produces a user principal. */
export type UserAuthSchemeDefinition<TName extends string = string> = AuthSchemeDefinition<
  TName,
  "user"
>;

/**
 * `true` when every scheme in the (non-empty) list is a user scheme, so a
 * principal resolved through any of them carries a non-null user.
 */
export type AllSchemesResolveUser<TSchemes extends readonly AuthSchemeDefinition[]> =
  TSchemes extends readonly [] ? false : TSchemes[number] extends UserAuthSchemeDefinition ? true : false;

/**
 * Route guard levels mirroring `@schemavaults/auth-server-sdk`'s
 * `withAuthenticatedApiRouteGuard` / `withAdminApiRouteGuard`.
 */
export const ROUTE_GUARD_TYPES = ["authenticated", "admin"] as const;
export type RouteGuardType = (typeof ROUTE_GUARD_TYPES)[number];

/**
 * Membership requirement within the organization named by a path/query
 * parameter of the operation. Mirrors `required_organization` +
 * `custom_is_user_in_organization` on the server SDK route guard: platform
 * administrators bypass the membership check unless `adminBypass` is false.
 */
export interface OrganizationRoleRequirement {
  /** Name of the request parameter (path, then query) carrying the organization id. */
  readonly parameter: string;
  /** Accepted membership roles. Empty means "any member". */
  readonly roles: readonly OrganizationMembershipRoleType[];
  /** Whether platform admins satisfy the requirement without membership (default true). */
  readonly adminBypass?: boolean;
}

/**
 * What a caller must present / be to invoke an operation. Represented in
 * the OpenAPI document both as the standard `security` requirement list
 * (one entry per accepted scheme, carrying the scopes) and as the
 * `x-schemavaults-auth` vendor extension so docs can show the route guard
 * and organization role in addition to the scopes.
 */
export interface AuthRequirements<
  TSchemes extends readonly AuthSchemeDefinition[] = readonly AuthSchemeDefinition[],
> {
  /** Schemes accepted for this operation (any one of them satisfies it). */
  readonly schemes: TSchemes;
  /** Who may call once authenticated. Defaults to "authenticated". */
  readonly routeGuard?: RouteGuardType;
  /**
   * Scopes the presented token's `scope` claim must include. A token with no
   * scope claim grants no scopes, so any non-empty list denies it (403).
   * There is no admin bypass: scopes describe what the TOKEN was granted.
   */
  readonly requiredScopes?: readonly string[];
  /** Organization membership requirement resolved from a request parameter. */
  readonly organization?: OrganizationRoleRequirement;
  /** Free-form note for the docs ("only the app owner may ...", ...). */
  readonly notes?: string;
}

export interface PublicOperationAuth {
  readonly type: "public";
  readonly notes?: string;
}

export interface RequiredOperationAuth<
  TSchemes extends readonly AuthSchemeDefinition[] = readonly AuthSchemeDefinition[],
> extends AuthRequirements<TSchemes> {
  readonly type: "required";
}

export type OperationAuth = PublicOperationAuth | RequiredOperationAuth;

/** Marks an operation as callable without credentials. */
export function publicAccess(notes?: string): PublicOperationAuth {
  return notes === undefined ? { type: "public" } : { type: "public", notes };
}

/**
 * Marks an operation as requiring one of the given schemes (+ extra checks).
 * The scheme list type is preserved so that operations accepting only
 * `principal: "user"` schemes get a non-nullable `ctx.auth.user`.
 */
export function requireAuth<const TSchemes extends readonly AuthSchemeDefinition[]>(
  requirements: AuthRequirements<TSchemes>,
): RequiredOperationAuth<TSchemes> {
  if (!Array.isArray(requirements.schemes) || requirements.schemes.length === 0) {
    throw new TypeError(
      "requireAuth() needs at least one auth scheme; use publicAccess() for open operations",
    );
  }
  const names = new Set<string>();
  for (const scheme of requirements.schemes) {
    if (names.has(scheme.name)) {
      throw new TypeError(`Auth scheme "${scheme.name}" listed twice`);
    }
    names.add(scheme.name);
  }
  return {
    type: "required",
    ...requirements,
    routeGuard: requirements.routeGuard ?? "authenticated",
  };
}

export function isPublicOperationAuth(auth: OperationAuth): auth is PublicOperationAuth {
  return auth.type === "public";
}

// ---------------------------------------------------------------------------
// Built-in SchemaVaults schemes
// ---------------------------------------------------------------------------
// The auth server may be any deployment of @schemavaults/auth-server,
// including white-label ones, so the docs copy never names SchemaVaults as
// the issuer. The scheme names (and challenge realms) are protocol
// identifiers and stay as they are.

/** `Authorization: Bearer <access token>` issued by the auth server. */
export const schemaVaultsAccessTokenBearerScheme = defineAuthScheme({
  name: "schemavaults-access-token",
  principal: "user",
  title: "Access token (Bearer)",
  description:
    "An access token issued by the auth server for this API server, sent as `Authorization: Bearer <token>`.",
  securityScheme: {
    type: "http",
    scheme: "bearer",
    bearerFormat: "JWT",
    description: "Access token issued by the auth server for this API server.",
  },
  challenge: 'Bearer realm="schemavaults"',
});

/**
 * The first-party access-token cookie set by the auth server / resource
 * server SDK (`AccessTokenCookieName(api_server_id)`). The cookie name is
 * per API server, so the concrete name is filled in by the caller.
 */
export function schemaVaultsAccessTokenCookieScheme(
  cookieName: string,
): AuthSchemeDefinition<"schemavaults-access-token-cookie", "user"> {
  return defineAuthScheme({
    name: "schemavaults-access-token-cookie",
    principal: "user",
    title: "Access token (cookie)",
    description: `The first-party HTTP-only access token cookie \`${cookieName}\` set after login.`,
    securityScheme: {
      type: "apiKey",
      in: "cookie",
      name: cookieName,
      description: "First-party access token cookie set after login.",
    },
  });
}

/** The auth server's own refresh-token cookie (only meaningful ON the auth server). */
export function schemaVaultsRefreshTokenCookieScheme(
  cookieName: string,
): AuthSchemeDefinition<"schemavaults-refresh-token-cookie", "user"> {
  return defineAuthScheme({
    name: "schemavaults-refresh-token-cookie",
    principal: "user",
    title: "Auth server session (refresh token cookie)",
    description: `The auth server's HTTP-only refresh token cookie \`${cookieName}\`; only the auth server itself can resolve it.`,
    securityScheme: {
      type: "apiKey",
      in: "cookie",
      name: cookieName,
      description: "Auth server session cookie.",
    },
  });
}

/** OAuth 2.0 `client_secret_basic` client authentication (RFC 6749 §2.3.1). */
export const oidcClientSecretBasicScheme = defineAuthScheme({
  name: "oidc-client-secret-basic",
  title: "OAuth 2.0 client credentials (HTTP Basic)",
  description:
    "Confidential client authentication: `Authorization: Basic base64(client_id:client_secret)` (client_secret_basic).",
  securityScheme: {
    type: "http",
    scheme: "basic",
    description: "client_secret_basic — RFC 6749 §2.3.1",
  },
  challenge: 'Basic realm="schemavaults"',
});

/** OAuth 2.0 `client_secret_post` client authentication (credentials in the form body). */
export const oidcClientSecretPostScheme = defineAuthScheme({
  name: "oidc-client-secret-post",
  title: "OAuth 2.0 client credentials (form body)",
  description:
    "Confidential client authentication with `client_id` and `client_secret` in the `application/x-www-form-urlencoded` body (client_secret_post).",
  securityScheme: {
    type: "apiKey",
    in: "header",
    name: "X-SchemaVaults-Client-Secret-Post",
    description:
      "Documentation placeholder: credentials travel in the form body as client_id/client_secret (client_secret_post, RFC 6749 §2.3.1).",
  },
});

/** A static API key in a header (e.g. cron / internal automation). */
export function apiKeyHeaderScheme<const TName extends string>(
  name: TName,
  headerName: string,
  description?: string,
): AuthSchemeDefinition<TName> {
  return defineAuthScheme({
    name,
    title: `API key (${headerName})`,
    description:
      description ?? `A pre-shared API key sent in the \`${headerName}\` header.`,
    securityScheme: {
      type: "apiKey",
      in: "header",
      name: headerName,
    },
  });
}
