import type { UserData } from "@schemavaults/auth-common";
import type { TokenActor } from "@schemavaults/jwt";

export interface IRouteGuard {
  isAccessAllowed: () => boolean;
  user: UserData | null;
  // Granted scope from the token that resolved this guard's user, carried
  // ALONGSIDE `user` (never folded into UserData). Null when the token had
  // no scope claim, or when no user was resolved.
  scope: string | null;
  // The client app the resolving token was issued to (its `app` claim),
  // carried alongside `user` like `scope`: lets a resource server tell its
  // own app's tokens from third-party clients'. Null when no user was
  // resolved, or when the guard was built from an already-resolved user.
  // Optional so third-party IRouteGuard implementations stay compatible.
  client_app_id?: string | null;
  // RFC 8693 §4.1 actor of the resolving token (its `act` claim): who acts
  // on behalf of `user`, e.g. an agent. Null when the token names no actor,
  // no user was resolved, or the token was revoked. Base access-control
  // decisions only on `user` and this current actor; `actor.prior_actor`
  // (earlier actors of a delegation chain) is informational only.
  // Optional so third-party IRouteGuard implementations stay compatible.
  actor?: TokenActor | null;
  // True when the presented token(s) verified but were reported revoked by
  // the `is_token_revoked` hook; `user` is null whenever this is true.
  // Optional so third-party IRouteGuard implementations stay compatible.
  revoked?: boolean;
}
