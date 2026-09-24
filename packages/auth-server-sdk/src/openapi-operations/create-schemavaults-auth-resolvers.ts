import {
  type ApiServerId,
  apiServerIdSchema,
  getAppEnvironment,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import {
  organizationIdSchema,
  type OrganizationMembershipRoleType,
} from "@schemavaults/auth-common/organizations";
import type { PotentiallyValidTokenSource, UserData } from "@schemavaults/auth-common";
import {
  OperationError,
  schemaVaultsAccessTokenBearerScheme,
  type AuthPrincipal,
  type AuthResolver,
  type AuthResolvers,
  type AuthSchemeDefinition,
  type HonoContext,
} from "@schemavaults/openapi-operations";
import { AccessTokenCookieName } from "@/AccessTokenCookieNames";
import getSchemavaultsApiServerId from "@/env/get-schemavaults-api-server-id";
import getSchemaVaultsAuthServerUrl from "@/env/get-schemavaults-auth-server-url";
import loadJwksAccessPrivateKey, {
  JWKS_ACCESS_PRIVATE_KEY_ENV_VAR_NAME,
} from "@/env/loadJwksAccessPrivateKey";
import isUserInOrganization from "@/isUserInOrganization";
import type { IJwtKeyManager } from "@/JwtKeyManager";
import type { IRouteGuard } from "@/route_guards/IRouteGuard";
import RouteGuardFactory from "@/route_guards/route-guard-factory";
import type { IsTokenRevokedFn } from "@/route_guards/token-revocation";
import { readCookie } from "./read-cookie";

/** Scheme names the resolvers are registered under. */
export const SCHEMAVAULTS_ACCESS_TOKEN_BEARER_SCHEME_NAME =
  schemaVaultsAccessTokenBearerScheme.name;
export const SCHEMAVAULTS_ACCESS_TOKEN_COOKIE_SCHEME_NAME =
  "schemavaults-access-token-cookie" as const;

/** Error codes of the responses the resolvers produce. */
export const SCHEMAVAULTS_AUTH_RESOLVER_ERROR_CODES = {
  invalidRequest: "invalid_request",
  invalidToken: "invalid_token",
  tokenRevoked: "token_revoked",
  accountDisabled: "account_disabled",
  notConfigured: "auth_not_configured",
} as const;

export interface CreateSchemaVaultsAuthResolversOptions {
  /**
   * The API server id access tokens must be issued for (their `aud`), and
   * whose access-token cookie (`AccessTokenCookieName(apiServerId)`) is
   * read. Default: `SCHEMAVAULTS_API_SERVER_ID` from the environment, read
   * on first use.
   */
  readonly apiServerId?: ApiServerId;
  /** Default: `getAppEnvironment()`, read on first use. */
  readonly environment?: SchemaVaultsAppEnvironment;
  /**
   * RFC 8707 resource URL(s) this resource server is known by; access
   * tokens whose `aud` is one of them are accepted too. See
   * `RouteGuardFactory`'s `accepted_audiences`.
   */
  readonly acceptedAudiences?: readonly string[];
  /**
   * Revocation check run against every token that verified. A revoked
   * token is refused with 401 (`token_revoked`); a hook that throws fails
   * closed. Omit for the claims-only fast path.
   */
  readonly isTokenRevoked?: IsTokenRevokedFn;
  /**
   * JWT key manager used to verify tokens. Default: a `RemoteJwtKeyManager`
   * fetching the auth server's JWKS with the
   * `SCHEMAVAULTS_AUTH_JWKS_ACCESS_PRIVATE_KEY` from the environment.
   */
  readonly jwtKeysManager?: IJwtKeyManager;
  /**
   * Base URL of the auth server organization membership is looked up on.
   * Default: `getSchemaVaultsAuthServerUrl()` for the app environment.
   */
  readonly authServerUrl?: string;
  /** Verbose `console.log` diagnostics (rejected tokens, guard details). Default false. */
  readonly debug?: boolean;
}

type TokenChallengeError = "invalid_request" | "invalid_token";

function challenge(scheme: AuthSchemeDefinition, error: TokenChallengeError): string {
  const base = scheme.challenge?.startsWith("Bearer")
    ? scheme.challenge
    : schemaVaultsAccessTokenBearerScheme.challenge ?? "Bearer";
  return `${base}, error="${error}"`;
}

function unauthorized(
  scheme: AuthSchemeDefinition,
  error: string,
  message: string,
  challengeError: TokenChallengeError = "invalid_token",
): OperationError {
  return new OperationError(
    401,
    { error, message },
    { "WWW-Authenticate": challenge(scheme, challengeError) },
  );
}

function notConfigured(detail: string, cause?: unknown): OperationError {
  console.error(
    `[createSchemaVaultsAuthResolvers] Access tokens cannot be verified: ${detail}`,
    ...(cause !== undefined ? [cause] : []),
  );
  return new OperationError(500, {
    error: SCHEMAVAULTS_AUTH_RESOLVER_ERROR_CODES.notConfigured,
    message: `Authentication is not configured on this server: ${detail}`,
  });
}

/**
 * The JWT inside the access-token cookie: the JSON `{ token, exp, ... }`
 * value the auth provider writes (skipped once `exp`, unix milliseconds,
 * has passed), or a raw JWT. Null when the cookie carries no usable token.
 */
export function accessTokenFromCookieValue(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.startsWith("{")) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return null;
    }
    if (typeof parsed !== "object" || parsed === null) return null;
    const { token, exp } = parsed as { token?: unknown; exp?: unknown };
    if (typeof token !== "string" || token.length === 0) return null;
    if (typeof exp === "number" && Date.now() >= exp) return null;
    return token;
  }
  return trimmed;
}

/**
 * Parses `Authorization: Bearer <token>`. `absent` when there is no header,
 * `malformed` when it is not a bearer credential with a single token.
 */
export function bearerTokenFromAuthorizationHeader(
  header: string | undefined,
): { kind: "absent" } | { kind: "malformed" } | { kind: "token"; token: string } {
  if (typeof header !== "string" || header.trim().length === 0) return { kind: "absent" };
  const parts = header.trim().split(/\s+/);
  if (parts.length !== 2 || parts[0]?.toLowerCase() !== "bearer" || !parts[1]) {
    return { kind: "malformed" };
  }
  return { kind: "token", token: parts[1] };
}

/**
 * Credential resolvers for the SchemaVaults access-token schemes of
 * `@schemavaults/openapi-operations`, for resource servers: verifies
 * `Authorization: Bearer <access token>` (`schemavaults-access-token`) and
 * the first-party access-token cookie `access_token_<api_server_id>`
 * (`schemavaults-access-token-cookie`) against the auth server's JWKS
 * through `RouteGuardFactory`, exactly like `withAuthenticatedApiRouteGuard`
 * does for classic route handlers.
 *
 * Per request each resolver:
 * - returns `null` when its credential is absent (the runtime tries the
 *   next accepted scheme, then answers 401 + `WWW-Authenticate`);
 * - answers 401 (`invalid_request`) for a malformed Authorization header;
 * - answers 401 (`invalid_token` / `token_revoked`) for a credential that
 *   does not verify, has expired, or was revoked (`isTokenRevoked`);
 * - answers 403 (`account_disabled`) for a disabled account;
 * - answers 500 (`auth_not_configured`) with a clear message when
 *   `SCHEMAVAULTS_AUTH_JWKS_ACCESS_PRIVATE_KEY` (or the API server id /
 *   auth server URL) is missing: a token is never waved through silently;
 * - otherwise resolves `{ scheme, user, isAdmin: user.admin === true,
 *   scope, getOrganizationRole }`, where `getOrganizationRole` asks the
 *   auth server (`isUserInOrganization`) with the JWKS access key.
 *
 * Environment-derived settings are read on first use, not when the
 * resolvers are created, so importing the module that builds them (e.g.
 * from an OpenAPI generation script) needs no environment.
 *
 * ```ts
 * export const api = createOperationsAppFactory<Ctx, UserData>({
 *   operations,
 *   authResolvers: createSchemaVaultsAuthResolvers<Ctx>(),
 * });
 * ```
 */
export function createSchemaVaultsAuthResolvers<TContext = unknown>(
  options: CreateSchemaVaultsAuthResolversOptions = {},
): AuthResolvers<UserData, TContext> {
  const debug = options.debug ?? false;

  let apiServerId: ApiServerId | undefined = options.apiServerId;
  const resolveApiServerId = (): ApiServerId => {
    if (apiServerId === undefined) {
      try {
        apiServerId = getSchemavaultsApiServerId();
      } catch (e: unknown) {
        throw notConfigured("the API server id could not be determined (SCHEMAVAULTS_API_SERVER_ID)", e);
      }
    }
    if (!apiServerIdSchema.safeParse(apiServerId).success) {
      throw notConfigured(`'${String(apiServerId)}' is not a valid API server id`);
    }
    return apiServerId;
  };

  let environment: SchemaVaultsAppEnvironment | undefined = options.environment;
  const resolveEnvironment = (): SchemaVaultsAppEnvironment => {
    if (environment === undefined) {
      try {
        environment = getAppEnvironment();
      } catch (e: unknown) {
        throw notConfigured("the app environment could not be determined", e);
      }
    }
    return environment;
  };

  let authServerUrl: string | undefined = options.authServerUrl;
  const resolveAuthServerUrl = (): string => {
    if (authServerUrl === undefined) {
      try {
        authServerUrl = getSchemaVaultsAuthServerUrl();
      } catch (e: unknown) {
        throw notConfigured("the auth server URL could not be determined", e);
      }
    }
    return authServerUrl;
  };

  let factory: RouteGuardFactory | undefined;
  let keysManager: IJwtKeyManager | undefined = options.jwtKeysManager;
  const resolveFactory = (): RouteGuardFactory => {
    if (factory === undefined) {
      const env = resolveEnvironment();
      try {
        factory = new RouteGuardFactory({
          environment: env,
          jwt_keys_manager: keysManager,
          is_token_revoked: options.isTokenRevoked,
          accepted_audiences: options.acceptedAudiences,
          debug,
        });
      } catch (e: unknown) {
        throw notConfigured("the JWT key manager could not be created", e);
      }
      if (keysManager === undefined) {
        // The factory built the default RemoteJwtKeyManager; mirror its
        // configuration check so a missing JWKS access key is a 500 up
        // front instead of a failed key fetch reported as a bad token.
        keysManager = {
          loadJwks: () => Promise.reject(new Error("unused")),
          isConfigured: () =>
            typeof process.env[JWKS_ACCESS_PRIVATE_KEY_ENV_VAR_NAME] === "string" &&
            process.env[JWKS_ACCESS_PRIVATE_KEY_ENV_VAR_NAME].length > 0,
        };
      }
    }
    if (!keysManager?.isConfigured()) {
      throw notConfigured(
        options.jwtKeysManager
          ? "the JWT key manager reports it is not configured"
          : `the '${JWKS_ACCESS_PRIVATE_KEY_ENV_VAR_NAME}' environment variable is not set`,
      );
    }
    return factory;
  };

  let jwksAccessPrivateKey: Promise<CryptoKey> | undefined;
  const resolveJwksAccessPrivateKey = (): Promise<CryptoKey> => {
    jwksAccessPrivateKey ??= loadJwksAccessPrivateKey().catch((e: unknown) => {
      jwksAccessPrivateKey = undefined;
      throw e;
    });
    return jwksAccessPrivateKey;
  };

  async function principalFromTokenSource(
    scheme: AuthSchemeDefinition,
    source: PotentiallyValidTokenSource,
  ): Promise<AuthPrincipal<UserData>> {
    const guardFactory = resolveFactory();
    const audience = resolveApiServerId();

    let guard: IRouteGuard;
    try {
      guard = await guardFactory.createGuardFromTokenSources("authenticated", [source], audience);
    } catch (e: unknown) {
      if (debug) {
        console.warn(
          `[createSchemaVaultsAuthResolvers] ${source.sourceHint ?? source.type} did not verify:`,
          e,
        );
      }
      throw unauthorized(
        scheme,
        SCHEMAVAULTS_AUTH_RESOLVER_ERROR_CODES.invalidToken,
        "The access token is invalid or has expired",
      );
    }

    if (guard.revoked === true) {
      throw unauthorized(
        scheme,
        SCHEMAVAULTS_AUTH_RESOLVER_ERROR_CODES.tokenRevoked,
        "The access token has been revoked",
      );
    }
    const user: UserData | null = guard.user;
    if (!user) {
      throw unauthorized(
        scheme,
        SCHEMAVAULTS_AUTH_RESOLVER_ERROR_CODES.invalidToken,
        "The access token is invalid or has expired",
      );
    }
    if (user.disabled) {
      throw new OperationError(403, {
        error: SCHEMAVAULTS_AUTH_RESOLVER_ERROR_CODES.accountDisabled,
        message: "Your account is disabled",
      });
    }

    return {
      scheme: scheme.name,
      user,
      isAdmin: user.admin === true,
      scope: guard.scope,
      getOrganizationRole: async (
        organizationId: string,
      ): Promise<OrganizationMembershipRoleType | false> => {
        const parsed = organizationIdSchema.safeParse(organizationId);
        if (!parsed.success) return false;
        return isUserInOrganization(
          resolveAuthServerUrl(),
          audience,
          await resolveJwksAccessPrivateKey(),
          user.uid,
          parsed.data,
        );
      },
    };
  }

  /** `Authorization: Bearer <access token>` */
  const bearer: AuthResolver<UserData, TContext> = async (c: HonoContext, scheme) => {
    const parsed = bearerTokenFromAuthorizationHeader(c.req.header("authorization"));
    if (parsed.kind === "absent") return null;
    if (parsed.kind === "malformed") {
      throw unauthorized(
        scheme,
        SCHEMAVAULTS_AUTH_RESOLVER_ERROR_CODES.invalidRequest,
        "The Authorization header must be 'Bearer <access token>'",
        "invalid_request",
      );
    }
    return principalFromTokenSource(scheme, {
      sourceHint: "Access Token from Authorization Bearer header",
      type: "access",
      token: parsed.token,
    });
  };

  /** The first-party access-token cookie `access_token_<api_server_id>`. */
  const cookie: AuthResolver<UserData, TContext> = async (c: HonoContext, scheme) => {
    const cookieHeader = c.req.header("cookie");
    if (typeof cookieHeader !== "string" || cookieHeader.length === 0) return null;
    const cookieName = AccessTokenCookieName(resolveApiServerId());
    const value = readCookie(cookieHeader, cookieName);
    if (value === undefined) return null;
    const token = accessTokenFromCookieValue(value);
    if (token === null) return null;
    return principalFromTokenSource(scheme, {
      sourceHint: `Access Token from cookie '${cookieName}'`,
      type: "access",
      token,
    });
  };

  return {
    [SCHEMAVAULTS_ACCESS_TOKEN_BEARER_SCHEME_NAME]: bearer,
    [SCHEMAVAULTS_ACCESS_TOKEN_COOKIE_SCHEME_NAME]: cookie,
  };
}

export default createSchemaVaultsAuthResolvers;
