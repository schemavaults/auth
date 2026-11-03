import {
  createJwksAccessProofToken,
  MAX_JWT_ACTOR_CLAIM_DEPTH,
  type TokenActor,
} from "@schemavaults/jwt";
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
 * The RFC 8693 §4.1 actor (`act`) of a delegated token, as the auth server's
 * introspection response reports it: who acts on behalf of the token's user
 * (e.g. an agent). The outermost actor is the current one; a nested `act` is
 * the prior actor of a delegation chain and is informational only.
 * {@link getActorFromIntrospectionResult} turns it into a `TokenActor`.
 */
export interface IntrospectedTokenActor {
  /** The actor's OIDC subject `<auth_server_app_id>|<uid>`. */
  sub: string;
  /** The actor's platform id (the `<uid>` part of `sub`). */
  uid: string;
  /** The client app the actor acts through. */
  client_id?: string;
  /** The prior actor of a delegation chain (informational only). */
  act?: IntrospectedTokenActor;
}

/**
 * One level of an introspected actor chain, built level by level like the
 * token's own `act` schema. Loose objects, so identity members a newer auth
 * server adds do not break this SDK; a malformed actor still fails the whole
 * response, so an agent can never pass for the user it acts for.
 */
function introspectedActorSchema(
  remaining_levels: number,
): z.ZodType<IntrospectedTokenActor> {
  const identity = {
    sub: z.string().min(1),
    uid: z.string().min(1),
    client_id: z.string().optional(),
  };
  if (remaining_levels <= 1) {
    return z.looseObject(identity);
  }
  return z.looseObject({
    ...identity,
    act: introspectedActorSchema(remaining_levels - 1).optional(),
  });
}

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
    /**
     * True when the user is a client app's service account: a machine
     * identity (client_credentials grant), not a person. Absent otherwise.
     */
    service_account: z.boolean().optional(),
    /**
     * The RFC 8693 actor of a delegated token (e.g. an agent acting for the
     * user); absent otherwise. See {@link getActorFromIntrospectionResult}.
     */
    act: introspectedActorSchema(MAX_JWT_ACTOR_CLAIM_DEPTH).optional(),
  }),
]);

export type TokenIntrospectionResult = z.infer<
  typeof tokenIntrospectionResultSchema
>;

function introspectedActorToTokenActor(
  actor: IntrospectedTokenActor,
): TokenActor {
  return {
    uid: actor.uid,
    sub: actor.sub,
    client_id: typeof actor.client_id === "string" ? actor.client_id : null,
    prior_actor: actor.act ? introspectedActorToTokenActor(actor.act) : null,
  };
}

/**
 * The actor acting on behalf of the user of an introspected token, in the
 * shape route guards and `decodeJWTsWithKeyManager()` report it (`uid`,
 * `sub`, `client_id`, `prior_actor`), or null when the token is inactive or
 * names no actor.
 *
 * This is the CURRENT actor: base access-control decisions on it and the
 * token's top-level claims only. `prior_actor` is informational
 * (RFC 8693 §4.1).
 */
export function getActorFromIntrospectionResult(
  result: TokenIntrospectionResult,
): TokenActor | null {
  if (!result.active || !result.act) {
    return null;
  }
  return introspectedActorToTokenActor(result.act);
}

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
