import "server-only";
import type {
  ApiServerId,
  AppId,
  SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import { getAudienceFromToken, type CustomJWTPayload } from "@schemavaults/jwt";
import { getAccessTokenSessionRefreshJti, type ServerlessDatabase } from "@/lib/auth-db";
import UnresolvableTokenResourceError from "@/lib/error/UnresolvableTokenResourceError";
import {
  decodeIntrospectableToken,
  isIntrospectedTokenActive,
  type DecodedIntrospectableToken,
  type OidcIntrospectionCaller,
} from "@/lib/oidc/introspection";
import { resolveTokenAudience, type ResolvedTokenAudience } from "@/lib/oidc/resolve-token-audience";
import type { OidcTokenRequestError } from "@/lib/oidc/token-request-extensions";

export interface VerifyTokenExchangeSubjectTokenOptions {
  dbh: ServerlessDatabase;
  /** The presented `subject_token`. */
  subject_token: string;
  /** The authenticated client asking for the exchange. */
  client_app_id: AppId;
  environment: SchemaVaultsAppEnvironment;
  debug?: boolean;
}

export type VerifiedTokenExchangeSubjectToken =
  | {
      ok: true;
      /** The verified claims of the subject token. */
      payload: CustomJWTPayload;
      /** The subject token's `aud`: the delegated token is minted for it too. */
      token_audience: string;
      /** The API server that audience belongs to (its keyset owner). */
      api_server_id: ApiServerId;
      /**
       * The user's session the subject token was issued in (the `jti` of
       * the refresh token minted alongside it), or null when it has none on
       * record. The delegated token joins it: ending the session (logout,
       * revoking that refresh token) revokes the agent's token too.
       */
      session_refresh_jti: string | null;
    }
  | { ok: false; error: OidcTokenRequestError };

/**
 * Verifies the `subject_token` of a token exchange: an access token a user
 * holds for one of the registered API servers, issued to the requesting
 * client, and still live. RFC 8693 §2.2.2 answers every failure with
 * `invalid_request`.
 *
 * The token is verified exactly as that API server's own introspection of
 * it would be (decryption with the API server's keyset, signature, issuer,
 * audience, expiry; then revocation, the user's consent to the client and
 * the client's connection to the API server), so a token is exchangeable
 * only while the API server would accept it. On top of that:
 *
 *  - it must have been issued to the requesting client (`app` claim): a
 *    client exchanges its own users' tokens, never another client's;
 *  - it must not be a delegated token already (`act`): an actor cannot
 *    re-delegate, and a delegated token cannot be swapped for a fresh one
 *    to outlive its expiry;
 *  - its subject must be a person, not a service account: a service
 *    account has no user to act for.
 *
 * It also reports the session the subject token belongs to, so the
 * delegated token can be revoked with it.
 *
 * Tokens for the auth server itself and for the reserved `oidc-userinfo`
 * audience are never exchangeable (no API server accepts delegated tokens
 * there). A keyset lookup that fails reads as an invalid subject token and
 * is recorded, as in introspection; other database failures propagate.
 */
export async function verifyTokenExchangeSubjectToken({
  dbh,
  subject_token,
  client_app_id,
  environment,
  debug = false,
}: VerifyTokenExchangeSubjectTokenOptions): Promise<VerifiedTokenExchangeSubjectToken> {
  const invalid = (error_description: string): VerifiedTokenExchangeSubjectToken => ({
    ok: false,
    error: { error: "invalid_request", error_description },
  });
  const INVALID_SUBJECT_TOKEN = "Invalid, expired or revoked 'subject_token'.";

  // The audience in the (unverified) token header names the API server
  // whose keyset can decrypt it; decoding then verifies it.
  let header_audience: string;
  try {
    header_audience = getAudienceFromToken(subject_token, environment);
  } catch {
    return invalid(INVALID_SUBJECT_TOKEN);
  }
  let resolved: ResolvedTokenAudience;
  try {
    resolved = await resolveTokenAudience(dbh.db, header_audience, environment, debug);
  } catch (e: unknown) {
    // A malformed audience (TypeError) or a resource URL no API server has
    // registered: not a token of this server. Database failures propagate.
    if (e instanceof TypeError || e instanceof UnresolvableTokenResourceError) {
      return invalid(INVALID_SUBJECT_TOKEN);
    }
    throw e;
  }
  if (resolved.kind === "auth-server") {
    return invalid("The 'subject_token' must be an access token for an API server.");
  }

  const caller: OidcIntrospectionCaller = {
    kind: "api_server",
    api_server_id: resolved.api_server_id,
  };
  const decoded: DecodedIntrospectableToken | null = await decodeIntrospectableToken({
    db: dbh.db,
    token: subject_token,
    caller,
    environment,
  });
  if (!decoded || decoded.kind !== "access") {
    return invalid(INVALID_SUBJECT_TOKEN);
  }
  const { payload } = decoded;
  if (payload.app !== client_app_id) {
    return invalid("The 'subject_token' was not issued to this client.");
  }
  if (payload.act) {
    return invalid("The 'subject_token' is already a delegated token; exchange the user's own access token.");
  }
  if (payload.service_account) {
    return invalid("The 'subject_token' belongs to a service account; there is no user to act for.");
  }
  if (!(await isIntrospectedTokenActive({ dbh, payload, caller }))) {
    return invalid(INVALID_SUBJECT_TOKEN);
  }

  const session_refresh_jti: string | null = payload.jti
    ? await getAccessTokenSessionRefreshJti(dbh.db, payload.jti, payload.uid)
    : null;

  return {
    ok: true,
    payload,
    token_audience: payload.aud,
    api_server_id: resolved.api_server_id,
    session_refresh_jti,
  };
}

export default verifyTokenExchangeSubjectToken;
