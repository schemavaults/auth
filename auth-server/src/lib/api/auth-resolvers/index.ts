import "server-only";
import type { UserData } from "@schemavaults/auth-common";
import type { AuthResolver, AuthResolvers } from "@schemavaults/openapi-operations";
import getAuthServerAppId from "@/lib/config/auth-server-app-id";
import type { AuthServerApiContext } from "../context";
import {
  accessTokenBearerScheme,
  accessTokenCookieScheme,
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
 * Credential resolvers of the auth server's API, keyed by auth scheme name.
 * Every app built by `apiRouteHandlers()` authenticates with these.
 */
export const authResolvers: AuthResolvers<UserData, AuthServerApiContext> = {
  [sessionCookieScheme.name]: sessionCookie,
  [accessTokenCookieScheme.name]: accessTokenCookie,
  [accessTokenBearerScheme.name]: bearerAccessToken,
  [clientAppSessionCookieScheme.name]: clientAppSessionCookie,
  [jwksAccessAssertionScheme.name]: jwksAccessAssertionResolver,
};
