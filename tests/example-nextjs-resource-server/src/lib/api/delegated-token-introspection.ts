import "server-only";
import {
  AccessTokenCookieName,
  getSchemaVaultsAuthServerUrl,
  getSchemavaultsApiServerId,
  introspectToken,
  loadJwksAccessPrivateKey,
  type UserData,
} from "@schemavaults/auth-server-sdk";
import {
  SCHEMAVAULTS_ACCESS_TOKEN_BEARER_SCHEME_NAME,
  SCHEMAVAULTS_AUTH_RESOLVER_ERROR_CODES,
  accessTokenFromCookieValue,
  bearerTokenFromAuthorizationHeader,
  readCookie,
} from "@schemavaults/auth-server-sdk/openapi-operations";
import {
  OperationError,
  type AuthResolver,
  type AuthResolvers,
} from "@schemavaults/openapi-operations";

type Introspect = (token: string) => Promise<boolean>;

let jwksAccessPrivateKey: Promise<CryptoKey> | null = null;

/** Asks the auth server whether a token minted for this API server is still active (RFC 7662). */
const introspectWithAuthServer: Introspect = async (token) => {
  jwksAccessPrivateKey ??= loadJwksAccessPrivateKey();
  const result = await introspectToken({
    auth_server_url: getSchemaVaultsAuthServerUrl(),
    api_server_id: getSchemavaultsApiServerId(),
    jwks_access_private_key: await jwksAccessPrivateKey,
    token,
  });
  return result.active;
};

/** The access token the resolver verified: the bearer token, or the access-token cookie's. */
function presentedToken(c: Parameters<AuthResolver>[0], schemeName: string): string | null {
  if (schemeName === SCHEMAVAULTS_ACCESS_TOKEN_BEARER_SCHEME_NAME) {
    const parsed = bearerTokenFromAuthorizationHeader(c.req.header("authorization"));
    return parsed.kind === "token" ? parsed.token : null;
  }
  const cookie = readCookie(c.req.header("cookie"), AccessTokenCookieName(getSchemavaultsApiServerId()));
  return cookie ? accessTokenFromCookieValue(cookie) : null;
}

/**
 * Checks DELEGATED tokens (an agent acting for a user: RFC 8693 `act`) with
 * the auth server on every request, as this API server (introspection with
 * its JWKS access key). Local verification proves a token authentic and
 * unexpired but cannot see a revocation, and an agent must lose access the
 * moment its user revokes it, ends its session or signs out. The user's own
 * tokens keep the claims-only fast path: one round trip per agent request is
 * the price, which a busy API server would cut with a short-lived cache.
 *
 * An inactive delegated token is refused with 401 `token_revoked`; when the
 * auth server cannot be asked, the request fails closed with 503.
 */
export function withDelegatedTokenIntrospection<TContext>(
  resolvers: AuthResolvers<UserData, TContext>,
  introspect: Introspect = introspectWithAuthServer,
): AuthResolvers<UserData, TContext> {
  const wrapped: Record<string, AuthResolver<UserData, TContext>> = {};
  for (const [schemeName, resolve] of Object.entries(resolvers)) {
    wrapped[schemeName] = async (c, scheme, context) => {
      const principal = await resolve(c, scheme, context);
      if (!principal?.actor) return principal;

      const token = presentedToken(c, schemeName);
      let active = false;
      try {
        active = token !== null && (await introspect(token));
      } catch (e: unknown) {
        console.error("[delegated-token-introspection] The auth server could not be asked", e);
        throw new OperationError(503, {
          error: "introspection_unavailable",
          message: "Delegated tokens cannot be checked right now; try again later",
        });
      }
      if (!active) {
        throw new OperationError(
          401,
          {
            error: SCHEMAVAULTS_AUTH_RESOLVER_ERROR_CODES.tokenRevoked,
            message: "The delegated access token was revoked",
          },
          { "WWW-Authenticate": 'Bearer error="invalid_token"' },
        );
      }
      return principal;
    };
  }
  return wrapped;
}
