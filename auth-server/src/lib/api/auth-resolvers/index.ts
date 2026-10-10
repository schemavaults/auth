import "server-only";
import type { UserData } from "@schemavaults/auth-common";
import type { AuthResolver, AuthResolvers } from "@schemavaults/openapi-operations";
import { decodeJWT, getKeysetIdFromToken, type I_JWT_Keys } from "@schemavaults/jwt";
import getAuthServerAppId from "@/lib/config/auth-server-app-id";
import AuthServerJwtKeysManager from "@/lib/AuthServerJwtKeysManager";
import type { AuthServerApiContext } from "../context";
import {
  accessTokenBearerScheme,
  accessTokenCookieScheme,
  clientAppRefreshTokenBearerScheme,
  clientAppSessionCookieScheme,
  jwksAccessAssertionScheme,
  sessionCookieScheme,
} from "../auth-schemes";
import {
  accessTokenCookieSource,
  bearerAccessTokenSource,
  refreshTokenCookieSource,
} from "./cookie-token-sources";
import { jwksAccessAssertionResolver } from "./jwks-access-assertion";
import { principalFromTokenSource } from "./token-source-principal";

type Resolver = AuthResolver<UserData, AuthServerApiContext>;

const sessionCookie: Resolver = (c, scheme, context) => {
  const source = refreshTokenCookieSource(c, getAuthServerAppId(), "Auth Server Refresh Token");
  return source ? principalFromTokenSource(context, scheme.name, source) : null;
};

const accessTokenCookie: Resolver = (c, scheme, context) => {
  const source = accessTokenCookieSource(c, getAuthServerAppId());
  return source ? principalFromTokenSource(context, scheme.name, source) : null;
};

const bearerAccessToken: Resolver = (c, scheme, context) => {
  const source = bearerAccessTokenSource(c);
  return source ? principalFromTokenSource(context, scheme.name, source) : null;
};

/** `refresh_token_<client_app_id>` where `client_app_id` is a path parameter. */
const clientAppSessionCookie: Resolver = (c, scheme, context) => {
  const client_app_id = c.req.param("client_app_id");
  if (typeof client_app_id !== "string" || client_app_id.length === 0) return null;
  const source = refreshTokenCookieSource(
    c,
    client_app_id,
    `Client App Refresh Token from cookie 'refresh_token_${client_app_id}'`,
  );
  return source ? principalFromTokenSource(context, scheme.name, source) : null;
};

/**
 * `Authorization: Bearer <refresh token>` for the path's `client_app_id`:
 * the same credential as {@link clientAppSessionCookie} but presented in the
 * header, as the client SDK does for apps whose refresh token is not an
 * HTTP-only cookie (inline delivery).
 *
 * The header carries no per-app binding the way the
 * `refresh_token_<client_app_id>` cookie does, so the token is decoded as a
 * refresh token (which also enforces it is a refresh token, not an access
 * token) and accepted only when its `app` claim is the path's
 * `client_app_id`. Any other credential — an access token, a refresh token
 * for another app, or anything that does not verify — resolves nobody here,
 * so the request falls through to the other accepted schemes and ultimately
 * 401. Only whoami lists this scheme, so a refresh token presented as a
 * bearer still unlocks nothing an access token would elsewhere.
 */
const clientAppRefreshTokenBearer: Resolver = async (c, scheme, context) => {
  const client_app_id = c.req.param("client_app_id");
  if (typeof client_app_id !== "string" || client_app_id.length === 0) return null;
  const source = bearerAccessTokenSource(c);
  if (!source) return null;
  const token = source.token;
  try {
    const keyset_id: string = getKeysetIdFromToken(token);
    const keyset: I_JWT_Keys = await new AuthServerJwtKeysManager(context.db).getKeyset(
      getAuthServerAppId(),
      keyset_id,
    );
    const decoded = await decodeJWT({
      type: "refresh",
      jwt: token,
      jwt_keys: keyset,
      env: context.environment,
    });
    if (decoded.app !== client_app_id) return null;
  } catch {
    return null;
  }
  return principalFromTokenSource(context, scheme.name, {
    sourceHint: `Client App Refresh Token (Bearer) for '${client_app_id}'`,
    type: "refresh",
    token,
  });
};

/**
 * Credential resolvers of the auth server's API, keyed by auth scheme name.
 * Every app built by `apiRouteHandlers()` authenticates with these.
 */
export const authResolvers: AuthResolvers<UserData, AuthServerApiContext> = {
  [sessionCookieScheme.name]: sessionCookie,
  [accessTokenCookieScheme.name]: accessTokenCookie,
  [accessTokenBearerScheme.name]: bearerAccessToken,
  [clientAppSessionCookieScheme.name]: clientAppSessionCookie,
  [clientAppRefreshTokenBearerScheme.name]: clientAppRefreshTokenBearer,
  [jwksAccessAssertionScheme.name]: jwksAccessAssertionResolver,
};
