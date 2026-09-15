import "server-only";
import {
  getAppEnvironment,
  getSchemavaultsApiServerId,
  getSchemaVaultsAuthServerUrl,
  isUserInOrganization,
  loadJwksAccessPrivateKey,
  RouteGuardFactory,
  type IRouteGuard,
  type UserData,
} from "@schemavaults/auth-server-sdk";
import {
  AccessTokenCookieName,
  accessTokenDataSchema,
  type PotentiallyValidTokenSource,
} from "@schemavaults/auth-common";
import {
  OperationError,
  getCookie,
  type AuthPrincipal,
  type AuthResolvers,
  type HonoContext,
} from "@schemavaults/openapi-operations";
import { accessTokenBearerScheme, accessTokenCookieScheme } from "./auth-schemes";

/**
 * Credential resolvers for this resource server, keyed by auth scheme name.
 *
 * Each resolver returns `null` when the request carries no credential for
 * its scheme (so the next accepted scheme is tried) and throws an
 * `OperationError` when a credential IS present but does not verify. The
 * actual verification is `@schemavaults/auth-server-sdk`'s
 * `RouteGuardFactory`, which fetches the auth server's JWKS remotely and
 * checks the token audience against this API server id, exactly like
 * `withAuthenticatedApiRouteGuard` does for classic route handlers.
 */

let routeGuardFactory: RouteGuardFactory | null = null;

function getRouteGuardFactory(): RouteGuardFactory {
  routeGuardFactory ??= new RouteGuardFactory({
    environment: getAppEnvironment(),
    debug: getAppEnvironment() === "development",
  });
  return routeGuardFactory;
}

async function principalFromTokenSource(
  scheme: string,
  source: PotentiallyValidTokenSource,
): Promise<AuthPrincipal<UserData>> {
  const api_server_id = getSchemavaultsApiServerId();
  let guard: IRouteGuard;
  try {
    guard = await getRouteGuardFactory().createGuardFromTokenSources(
      "authenticated",
      [source],
      api_server_id,
    );
  } catch (e: unknown) {
    console.warn(`[auth-resolvers] ${source.sourceHint} failed verification:`, e);
    throw invalidToken();
  }
  const user = guard.user;
  if (!user) throw invalidToken();
  if (user.disabled) {
    throw new OperationError(403, { error: "account_disabled", message: "Your account is disabled" });
  }
  return {
    scheme,
    user,
    isAdmin: user.admin === true,
    scope: guard.scope,
    getOrganizationRole: async (organization_id) =>
      isUserInOrganization(
        getSchemaVaultsAuthServerUrl(),
        api_server_id,
        await loadJwksAccessPrivateKey(),
        user.uid,
        organization_id,
      ),
  };
}

function invalidToken(): OperationError {
  return new OperationError(
    401,
    { error: "invalid_token", message: "The presented access token is invalid or expired" },
    { "WWW-Authenticate": 'Bearer error="invalid_token"' },
  );
}

/** Extracts the JWT from the SDK's access token cookie (JSON `{ token, exp }` or a raw JWT). */
function accessTokenFromCookieValue(value: string): string | null {
  try {
    const parsed = accessTokenDataSchema.safeParse(JSON.parse(value));
    if (parsed.success) {
      return Date.now() < parsed.data.exp ? parsed.data.token : null;
    }
  } catch {
    // not JSON: fall through to the raw JWT form
  }
  return value.length > 64 ? value : null;
}

export const authResolvers: AuthResolvers<UserData> = {
  [accessTokenBearerScheme.name]: async (c: HonoContext) => {
    const header = c.req.header("authorization");
    if (typeof header !== "string" || !header.startsWith("Bearer ")) return null;
    const token = header.slice("Bearer ".length).trim();
    if (token.length === 0) return null;
    return principalFromTokenSource(accessTokenBearerScheme.name, {
      sourceHint: "Access Token from Authorization Bearer header",
      type: "access",
      token,
    });
  },
  [accessTokenCookieScheme.name]: async (c: HonoContext) => {
    const cookieName = AccessTokenCookieName(getSchemavaultsApiServerId());
    const value = getCookie(c, cookieName);
    if (typeof value !== "string" || value.length === 0) return null;
    const token = accessTokenFromCookieValue(value);
    if (!token) return null;
    return principalFromTokenSource(accessTokenCookieScheme.name, {
      sourceHint: `Access Token from cookie '${cookieName}'`,
      type: "access",
      token,
    });
  },
};
