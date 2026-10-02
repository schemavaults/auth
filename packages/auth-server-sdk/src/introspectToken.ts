import { createJwksAccessProofToken } from "@schemavaults/jwt";
import {
  type ApiServerId,
  apiServerIdSchema,
} from "@schemavaults/app-definitions";
import {
  getOidcEndpointUrl,
  OAUTH_JWT_BEARER_CLIENT_ASSERTION_TYPE,
} from "@schemavaults/auth-common";
import { z } from "zod";

/**
 * The auth server's RFC 7662 §2.2 introspection response. An inactive token
 * is exactly `{ active: false }`: expired, revoked, issued for another API
 * server and malformed tokens are indistinguishable.
 */
export const tokenIntrospectionResultSchema = z.union([
  z.object({ active: z.literal(false) }),
  z.looseObject({
    active: z.literal(true),
    /** Space-delimited granted scope; absent for plain OAuth 2.1 grants. */
    scope: z.string().optional(),
    /** The client application the token was issued to. */
    client_id: z.string(),
    /** The user's email; only when the `email` scope was granted. */
    username: z.string().optional(),
    token_type: z.literal("Bearer").optional(),
    /** Expiry, seconds since the Unix epoch. */
    exp: z.number().int(),
    /** Issued at, seconds since the Unix epoch. */
    iat: z.number().int(),
    /** OIDC subject `<auth_server_app_id>|<uid>`. */
    sub: z.string(),
    /** The platform user id. */
    uid: z.string(),
    /** The API server id, or the RFC 8707 resource URL the token was minted for. */
    aud: z.string(),
    iss: z.string(),
    jti: z.string().optional(),
  }),
]);

export type TokenIntrospectionResult = z.infer<
  typeof tokenIntrospectionResultSchema
>;

export interface IIntrospectTokenOptions {
  /** The auth server URL (the issuer). */
  auth_server_url: string;
  /** The calling API server, which the token must have been minted for. */
  api_server_id: ApiServerId;
  /** The API server's JWKS access private key (see `loadJwksAccessPrivateKey()`). */
  jwks_access_private_key: CryptoKey;
  /** The access token to introspect. */
  token: string;
  /** Defaults to the global `fetch`. */
  fetch?: typeof fetch;
}

/**
 * Asks the auth server whether an access token minted for this API server is
 * still active (RFC 7662 token introspection).
 *
 * Local verification (the route guards, `decodeJWTsWithKeyManager`) proves a
 * token is authentic and unexpired, but cannot see what happened since it was
 * issued: a logout, a password reset, a disabled account, the user
 * de-authorizing the client app, or the app being disconnected from this API
 * server. Introspection can, at the cost of a round trip to the auth server.
 *
 * The API server authenticates with `private_key_jwt`: a fresh single-use
 * JWKS access assertion (`createJwksAccessProofToken()`) per call, signed with
 * its JWKS access key. Only access tokens minted for this API server (its id,
 * or one of its RFC 8707 resource URLs, as `aud`) can come back active.
 *
 * @throws when the auth server refuses the request (e.g. 401 for a JWKS access
 * key that is not the API server's active one) or answers unexpectedly.
 */
export async function introspectToken({
  auth_server_url,
  api_server_id,
  jwks_access_private_key,
  token,
  fetch: fetchImpl = fetch,
}: IIntrospectTokenOptions): Promise<TokenIntrospectionResult> {
  if (!apiServerIdSchema.safeParse(api_server_id).success) {
    throw new TypeError("Invalid API server ID!");
  }
  if (typeof token !== "string" || token.length === 0) {
    throw new TypeError("Expected a token to introspect!");
  }

  const client_assertion: string = await createJwksAccessProofToken({
    api_server_id,
    auth_server_url,
    private_key: jwks_access_private_key,
  });

  const response: Response = await fetchImpl(
    getOidcEndpointUrl(auth_server_url, "introspection"),
    {
      method: "POST",
      headers: new Headers({
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      }),
      body: new URLSearchParams({
        token,
        client_id: api_server_id,
        client_assertion_type: OAUTH_JWT_BEARER_CLIENT_ASSERTION_TYPE,
        client_assertion,
      }).toString(),
    },
  );

  if (!response.ok) {
    let detail: string = "";
    try {
      const body: unknown = await response.json();
      if (
        typeof body === "object" &&
        body !== null &&
        "error" in body &&
        typeof body.error === "string"
      ) {
        detail = `: ${body.error}`;
      }
    } catch {
      // Not a JSON error body.
    }
    throw new Error(
      `Token introspection was refused by the auth server (status: ${response.status}${detail})`,
    );
  }

  const parsed = tokenIntrospectionResultSchema.safeParse(
    await response.json(),
  );
  if (!parsed.success) {
    throw new Error(
      "Received an unexpected token introspection response from the auth server",
      { cause: parsed.error },
    );
  }
  return parsed.data;
}

export default introspectToken;
