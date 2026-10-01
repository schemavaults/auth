import "server-only";
import type { CustomJWTPayload } from "@schemavaults/jwt";
import {
  getUserTokensValidAfter,
  isTokenIatRevoked,
  isTokenRevoked,
  type ServerlessDatabase,
} from "@/lib/auth-db";
import isAppAuthorizedForUser from "@/lib/auth-db/apps/authorized-apps-registry/is-app-authorized-for-user";
import { isClientAppPermittedForApiServer } from "@/lib/validate-audience";
import type { OidcIntrospectionCaller } from "./types";

export interface IsIntrospectedTokenActiveOptions {
  dbh: ServerlessDatabase;
  /** A token that verified and that the caller may see. */
  payload: CustomJWTPayload;
  caller: OidcIntrospectionCaller;
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
 *    rule), so disconnecting the app deactivates its tokens
 *
 * Database failures propagate (the endpoint answers `server_error`) rather
 * than reporting a token inactive it may not be.
 */
export async function isIntrospectedTokenActive({
  dbh,
  payload,
  caller,
}: IsIntrospectedTokenActiveOptions): Promise<boolean> {
  if (payload.disabled) {
    return false;
  }

  // Unlike the refresh grant, introspection applies NO rotation-reuse
  // grace window: a rotated-away refresh token reports inactive
  // immediately — the grace exists so benign concurrent refreshes
  // succeed, not to make superseded tokens look alive.
  if (payload.jti && (await isTokenRevoked(dbh.db, payload.jti))) {
    return false;
  }
  const tokens_valid_after: number = await getUserTokensValidAfter(
    dbh.db,
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
  if (!(await isAppAuthorizedForUser(dbh.db, payload.uid, payload.app))) {
    return false;
  }

  if (
    caller.kind === "api_server" &&
    !(await isClientAppPermittedForApiServer(
      payload.app,
      caller.api_server_id,
      dbh,
    ))
  ) {
    return false;
  }

  return true;
}

export default isIntrospectedTokenActive;
