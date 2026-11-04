import "server-only";
import type { AppId } from "@schemavaults/app-definitions";
import { formatOidcSubClaim } from "@schemavaults/auth-common";
import type { JwtActorClaim } from "@schemavaults/jwt";
import type { OidcIntrospectionActor } from "./types";

/**
 * Maps a token's RFC 8693 `act` claim to the actor introspection reports.
 * On the wire `act.sub` is the actor's bare uid (like the token's own
 * `sub`); the response names the actor the way it names the token's
 * subject: the OIDC `sub` `<auth_server_app_id>|<uid>` plus the bare
 * `uid`. Prior actors are mapped the same way, level by level (the token
 * schema already limits the chain's depth).
 */
export function toOidcIntrospectionActor(
  act: JwtActorClaim,
  auth_server_app_id: AppId,
): OidcIntrospectionActor {
  return {
    sub: formatOidcSubClaim(auth_server_app_id, act.sub),
    uid: act.sub,
    ...(act.client_id ? { client_id: act.client_id } : {}),
    ...(act.act
      ? { act: toOidcIntrospectionActor(act.act, auth_server_app_id) }
      : {}),
  };
}

export default toOidcIntrospectionActor;
