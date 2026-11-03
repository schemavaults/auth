import type { AuthPrincipalActor } from "@schemavaults/openapi-operations";
import type { TokenActor } from "@schemavaults/jwt";

/**
 * Maps a decoded token's RFC 8693 actor onto the principal's `actor`:
 * `sub` → `sub` (the OIDC subject), `client_id` → `clientId` (omitted when
 * null), `prior_actor` → `actor` (omitted when null). The outermost actor
 * is the current one; nested actors are informational only.
 */
export function tokenActorToPrincipalActor(
  actor: TokenActor,
): AuthPrincipalActor {
  return {
    sub: actor.sub,
    ...(typeof actor.client_id === "string" ? { clientId: actor.client_id } : {}),
    ...(actor.prior_actor
      ? { actor: tokenActorToPrincipalActor(actor.prior_actor) }
      : {}),
  };
}
