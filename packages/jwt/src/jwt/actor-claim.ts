import type { z as zod } from "zod";
import { appIdSchema, type AppId } from "@schemavaults/app-definitions";
import type { AuthTokenTypes } from "@schemavaults/auth-common";

/**
 * RFC 8693 §4.1 actor (`act`) claim of an ACCESS token: the token's `sub`
 * is the user, `act` names who acts on the user's behalf (an agent).
 *
 * The outermost `act` is the CURRENT actor; a nested `act` is the prior
 * actor of a delegation chain and is informational only. Per RFC 8693
 * §4.1, access-control decisions MUST be based only on the token's
 * top-level claims and the current actor, never on prior actors.
 *
 * Only identity claims appear inside `act` (no `exp`, `nbf`, `aud`, ...),
 * and a chain is at most {@link MAX_JWT_ACTOR_CLAIM_DEPTH} levels deep.
 */
export interface JwtActorClaim {
  /** Bare uid of the acting principal, like the token's top-level `sub`. */
  sub: string;
  /** The client app the actor acts through. */
  client_id?: AppId;
  /** Prior actor in the delegation chain (informational only). */
  act?: JwtActorClaim;
}

/** The current actor plus at most two prior actors. */
export const MAX_JWT_ACTOR_CLAIM_DEPTH = 3 as const;

function createActorClaimLevelSchema(
  z: typeof zod,
  remaining_levels: number,
): zod.ZodType<JwtActorClaim> {
  const identity = {
    sub: z.guid(),
    client_id: appIdSchema.optional(),
  };
  // The deepest permitted level cannot name a prior actor, so a chain
  // longer than the limit fails as an unrecognized `act` key.
  if (remaining_levels <= 1) {
    return z.object(identity).strict();
  }
  return z
    .object({
      ...identity,
      act: createActorClaimLevelSchema(z, remaining_levels - 1).optional(),
    })
    .strict();
}

/**
 * Schema of the RFC 8693 `act` claim of SchemaVaults access tokens (see
 * {@link JwtActorClaim}): strict objects, at most
 * {@link MAX_JWT_ACTOR_CLAIM_DEPTH} levels, built level by level rather
 * than with `z.lazy`. Access control uses only the outermost (current)
 * actor; nested actors are informational.
 */
export function createJwtActorClaimSchema(
  z: typeof zod,
): zod.ZodType<JwtActorClaim> {
  return createActorClaimLevelSchema(z, MAX_JWT_ACTOR_CLAIM_DEPTH);
}

/**
 * Validates the `actor` option of token generation: only access tokens may
 * carry an actor (refresh tokens never do), and it must match
 * {@link createJwtActorClaimSchema}. Returns the claim to embed as `act`, or
 * undefined when no actor was requested.
 */
export function parseActorClaimForGeneratedToken(
  z: typeof zod,
  type: AuthTokenTypes,
  actor: JwtActorClaim | undefined,
): JwtActorClaim | undefined {
  if (actor === undefined) {
    return undefined;
  }
  if (type !== "access") {
    throw new Error("Only access tokens may carry an actor ('act')!");
  }
  const parsed = createJwtActorClaimSchema(z).safeParse(actor);
  if (!parsed.success) {
    throw new TypeError(
      `Invalid 'actor': ${parsed.error.issues.map((i) => i.message).join(", ")}`,
    );
  }
  return parsed.data;
}

/**
 * A decoded token's RFC 8693 actor (its `act` claim), as resource servers
 * see it. `uid` is the actor's platform id (`act.sub` on the wire); `sub` is
 * its OIDC subject `<auth_server_app_id>|<uid>`, like `UserData.sub`.
 *
 * This is the CURRENT actor: base access-control decisions on it and the
 * token's top-level claims only. `prior_actor` (the nested `act` of a
 * delegation chain) is informational only (RFC 8693 §4.1).
 */
export interface TokenActor {
  uid: string;
  sub: string;
  client_id: string | null;
  prior_actor: TokenActor | null;
}
