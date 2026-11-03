import { getAuthServerAppId, type AppId } from "@schemavaults/app-definitions";
import { formatOidcSubClaim, type UserData } from "@schemavaults/auth-common";
import type { CustomJWTPayload } from "./payload_data";
import type { JwtActorClaim, TokenActor } from "./actor-claim";

// Maps a decoded custom-JWT payload to the canonical UserData. The token's
// granted `scope` and its RFC 8693 actor (`act`) are deliberately NOT folded
// in here — they are threaded ALONGSIDE the user data (see
// `getScopeFromCustomJwtPayload` / `getActorFromCustomJwtPayload` and the
// `{ user, scope, actor }` record in @schemavaults/auth-server-sdk's
// decodeJWTsWithKeyManager) so route guards can enforce `required_scopes`
// without polluting the user identity type. Fields are copied one by one
// so no other token claim can reach the (strict) UserData.
//
// The token payload keeps `sub === uid` on the wire (resource servers on
// older SDKs verify that), while UserData.sub is the OIDC subject
// `<auth_server_app_id>|<uid>`, so the subject is rebuilt here from the uid.
export function customJwtPayloadToUserData(
  payload: CustomJWTPayload,
  auth_server_app_id: AppId = getAuthServerAppId(),
): UserData {
  return {
    uid: payload.uid,
    sub: formatOidcSubClaim(auth_server_app_id, payload.uid),
    email: payload.email,
    email_verified: payload.email_verified,
    admin: payload.admin,
    disabled: payload.disabled,
    created_at: payload.created_at,
    ...(payload.service_account === true ? { service_account: true } : {}),
  };
}

/**
 * Extracts the granted scope claim from a decoded custom-JWT payload, to be
 * carried alongside the UserData. Returns null when the token has no scope
 * claim (issued before scopes became first-class), which route guards treat
 * as "no scopes granted".
 */
export function getScopeFromCustomJwtPayload(
  payload: CustomJWTPayload,
): string | null {
  return typeof payload.scope === "string" && payload.scope.length > 0
    ? payload.scope
    : null;
}

function actorClaimToTokenActor(
  act: JwtActorClaim,
  auth_server_app_id: AppId,
): TokenActor {
  return {
    uid: act.sub,
    sub: formatOidcSubClaim(auth_server_app_id, act.sub),
    client_id: typeof act.client_id === "string" ? act.client_id : null,
    prior_actor: act.act ? actorClaimToTokenActor(act.act, auth_server_app_id) : null,
  };
}

/**
 * Extracts the RFC 8693 §4.1 actor (`act` claim) from a decoded access-token
 * payload, to be carried alongside the UserData like the scope. Returns null
 * when the token names no actor.
 *
 * The returned actor is the CURRENT actor: base access-control decisions on
 * it and the token's top-level claims only. `prior_actor` (nested `act`) is
 * informational only. `sub` is rebuilt in the OIDC form
 * `<auth_server_app_id>|<uid>` from the bare uid on the wire, like
 * `customJwtPayloadToUserData()` does for the user.
 */
export function getActorFromCustomJwtPayload(
  payload: CustomJWTPayload,
  auth_server_app_id: AppId = getAuthServerAppId(),
): TokenActor | null {
  return payload.act ? actorClaimToTokenActor(payload.act, auth_server_app_id) : null;
}
