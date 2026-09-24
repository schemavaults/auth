import {
  schemaVaultsAccessTokenBearerScheme,
  schemaVaultsAccessTokenCookieScheme,
  type AuthSchemeDefinition,
} from "@schemavaults/openapi-operations";

/** `Authorization: Bearer <access token>` minted by the auth server for this API server. */
export const accessTokenBearerScheme = schemaVaultsAccessTokenBearerScheme;

/**
 * The first-party access token cookie the `@schemavaults/auth-client-sdk`
 * sets after login. Its real name is `access_token_<api_server_id>`; the id
 * is only known from the environment at request time, so the documented
 * name uses the placeholder and the resolver computes the real one.
 */
export const accessTokenCookieScheme: AuthSchemeDefinition<"schemavaults-access-token-cookie", "user"> =
  schemaVaultsAccessTokenCookieScheme("access_token_<api_server_id>");

/**
 * Either credential is accepted by the user-facing operations. Both are
 * `principal: "user"` schemes, so handlers of operations accepting only
 * these get `ctx.auth.user` typed as `UserData` (never null).
 */
export const userCredentialSchemes = [accessTokenBearerScheme, accessTokenCookieScheme] as const;
