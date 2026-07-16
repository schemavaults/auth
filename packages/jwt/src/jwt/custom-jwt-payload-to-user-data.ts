import type { UserData } from "@schemavaults/auth-common";
import type { CustomJWTPayload } from "./payload_data";

// Maps a decoded custom-JWT payload to the canonical UserData. The token's
// granted `scope` is deliberately NOT folded in here — it is threaded
// ALONGSIDE the user data (see `getScopeFromCustomJwtPayload` and the
// `{ user, scope }` record in @schemavaults/auth-server-sdk's
// decodeJWTsWithKeyManager) so route guards can enforce `required_scopes`
// without polluting the user identity type.
export function customJwtPayloadToUserData(
  payload: CustomJWTPayload,
): UserData {
  return {
    uid: payload.uid,
    sub: payload.sub,
    email: payload.email,
    email_verified: payload.email_verified,
    admin: payload.admin,
    disabled: payload.disabled,
    created_at: payload.created_at,
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
