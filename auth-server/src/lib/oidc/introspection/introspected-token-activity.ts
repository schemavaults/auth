import "server-only";
import type { ApiServerId, AppId } from "@schemavaults/app-definitions";
import { getAuthServerAppId } from "@schemavaults/app-definitions";
import type { CustomJWTPayload } from "@schemavaults/jwt";
import { isTokenIatRevoked } from "@/lib/auth-db/users/is-token-iat-revoked";
import type { OidcIntrospectionCaller } from "./types";

/**
 * The post-issuance signals a token's activity is decided from, abstracted
 * so the decision itself can be unit tested without Postgres. The database
 * binding is `isIntrospectedTokenActive` (is-introspected-token-active.ts).
 */
export interface IntrospectedTokenActivitySignals {
  /** Explicit `jti` revocation (logout, refresh token rotation). */
  isJtiRevoked: (jti: string) => Promise<boolean>;
  /** Per-user `tokens_valid_after` watermark in unix seconds (`0` = unset). */
  getTokensValidAfter: (uid: string) => Promise<number>;
  /** Whether the user still authorizes the client app the token was issued to. */
  isAppAuthorizedForUser: (uid: string, app_id: AppId) => Promise<boolean>;
  /**
   * Whether the client app is still allowed to obtain tokens for the API
   * server (the token endpoints' app-to-API connection rule).
   */
  isClientAppPermittedForApiServer: (
    app_id: AppId,
    api_server_id: ApiServerId,
  ) => Promise<boolean>;
}

export interface EvaluateIntrospectedTokenActivityOptions {
  /** A token that verified and that the caller may see. */
  payload: CustomJWTPayload;
  caller: OidcIntrospectionCaller;
  signals: IntrospectedTokenActivitySignals;
  auth_server_app_id?: AppId;
}

/**
 * Whether a verified token is still active: what happened since it was
 * issued, which cryptographic verification cannot see. A token is active
 * only when:
 *
 *  - the account is not disabled
 *  - its jti has not been revoked (logout / rotation) and it predates no
 *    per-user tokens_valid_after watermark (password reset, disabled
 *    account)
 *  - the user still authorizes the client app the token was issued to:
 *    §2.2 defines `active` as "has not been revoked by the resource owner",
 *    and the refresh grant refuses a de-authorized app's tokens too
 *  - for an API server caller, the client app is still allowed to obtain
 *    tokens for that API server (the token endpoints' app-to-API connection
 *    rule), so disconnecting the app deactivates its tokens. The auth
 *    server's own app is exempt: it never has an app-to-API connection
 *    (the permissions registry refuses to record one, so the token
 *    endpoints never mint an API-server token for it) and the only such
 *    tokens are the ones the auth server mints internally for its own
 *    service calls — the superuser token it presents to the mail server
 *    (`spoofSuperuserAccessToken`). No connection could have been removed
 *    since issuance, and consulting the table would only ever report them
 *    inactive, refusing every email the auth server sends.
 *
 * Signal failures propagate (the endpoint answers `server_error`) rather
 * than reporting a token inactive it may not be.
 */
export async function evaluateIntrospectedTokenActivity({
  payload,
  caller,
  signals,
  auth_server_app_id = getAuthServerAppId(),
}: EvaluateIntrospectedTokenActivityOptions): Promise<boolean> {
  if (payload.disabled) {
    return false;
  }

  // Unlike the refresh grant, introspection applies NO rotation-reuse
  // grace window: a rotated-away refresh token reports inactive
  // immediately — the grace exists so benign concurrent refreshes
  // succeed, not to make superseded tokens look alive.
  if (payload.jti && (await signals.isJtiRevoked(payload.jti))) {
    return false;
  }
  const tokens_valid_after: number = await signals.getTokensValidAfter(
    payload.uid,
  );
  if (isTokenIatRevoked(payload.iat, tokens_valid_after)) {
    return false;
  }

  // Revoking the app's authorization (DELETE /api/apps/{app_id}/authorize)
  // also revokes its tracked tokens by jti, but issued-token tracking is
  // best-effort, so the consent itself is checked here as well. A service
  // account's authorization row is created with it, so client_credentials
  // tokens pass.
  if (!(await signals.isAppAuthorizedForUser(payload.uid, payload.app))) {
    return false;
  }

  if (
    caller.kind === "api_server" &&
    payload.app !== auth_server_app_id &&
    !(await signals.isClientAppPermittedForApiServer(
      payload.app,
      caller.api_server_id,
    ))
  ) {
    return false;
  }

  return true;
}

export default evaluateIntrospectedTokenActivity;
