import {
  AccessTokenCookieName,
  RefreshTokenCookieName,
} from "@schemavaults/auth-common";
import {
  defineAuthScheme,
  schemaVaultsAccessTokenBearerScheme,
  schemaVaultsAccessTokenCookieScheme,
  schemaVaultsRefreshTokenCookieScheme,
  type AuthSchemeDefinition,
} from "@schemavaults/openapi-operations";

/**
 * The credentials the auth server's own API accepts. The real cookie names
 * depend on the deployment's auth server app id (white-label deployments
 * change it), which is only known from the environment at request time, so
 * the documented names use a placeholder and the resolvers in
 * ./auth-resolvers compute the real ones.
 */
const AUTH_SERVER_APP_ID_PLACEHOLDER = "<auth_server_app_id>";

/** The HTTP-only refresh token cookie set by login: the browser session. */
export const sessionCookieScheme: AuthSchemeDefinition<"schemavaults-refresh-token-cookie"> =
  schemaVaultsRefreshTokenCookieScheme(RefreshTokenCookieName(AUTH_SERVER_APP_ID_PLACEHOLDER));

/** The auth server's own first-party access token cookie (`{ token, exp }` JSON). */
export const accessTokenCookieScheme: AuthSchemeDefinition<"schemavaults-access-token-cookie"> =
  schemaVaultsAccessTokenCookieScheme(AccessTokenCookieName(AUTH_SERVER_APP_ID_PLACEHOLDER));

/** `Authorization: Bearer <access token>` minted for the auth server audience. */
export const accessTokenBearerScheme = schemaVaultsAccessTokenBearerScheme;

/**
 * The per-client-app refresh token cookie (`refresh_token_<client_app_id>`)
 * issued during an OAuth2 grant. Only `GET /api/auth/whoami/{client_app_id}`
 * accepts it: SDK clients may hold it without an auth server session.
 */
export const clientAppSessionCookieScheme = defineAuthScheme({
  name: "schemavaults-client-app-refresh-token-cookie",
  title: "Client app session (refresh token cookie)",
  description:
    "The HTTP-only refresh token cookie `refresh_token_<client_app_id>` issued to a client application during the OAuth2 grant; `client_app_id` is the path parameter of the operation.",
  securityScheme: {
    type: "apiKey",
    in: "cookie",
    name: RefreshTokenCookieName("<client_app_id>"),
    description: "Client application refresh token cookie.",
  },
});

/**
 * A JWKS access assertion: a short-lived JWT signed by an API server's JWKS
 * access private key (see `POST /api/apis/{api_server_id}/jwks-access-key`),
 * presented as a bearer token by resource servers calling the auth server
 * on their own behalf.
 */
export const jwksAccessAssertionScheme = defineAuthScheme({
  name: "schemavaults-jwks-access-assertion",
  title: "JWKS access assertion (Bearer)",
  description:
    "A single-use JWT signed with the API server's JWKS access private key (`createJwksAccessProofToken()` from `@schemavaults/jwt`), sent as `Authorization: Bearer <assertion>`. Identifies the calling API server, not a user.",
  securityScheme: {
    type: "http",
    scheme: "bearer",
    bearerFormat: "JWT",
    description: "JWKS access assertion signed by the API server's JWKS access key.",
  },
  challenge: 'Bearer realm="schemavaults-jwks-access"',
});

/**
 * The credentials every session-guarded operation accepts, in the order
 * they are tried: the browser session first, then the access token cookie,
 * then a bearer access token.
 */
export const sessionSchemes = [
  sessionCookieScheme,
  accessTokenCookieScheme,
  accessTokenBearerScheme,
] as const;
