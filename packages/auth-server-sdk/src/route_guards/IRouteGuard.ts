import type { UserData } from "@schemavaults/auth-common";

export interface IRouteGuard {
  isAccessAllowed: () => boolean;
  user: UserData | null;
  // Granted scope from the token that resolved this guard's user, carried
  // ALONGSIDE `user` (never folded into UserData). Null when the token had
  // no scope claim, or when no user was resolved.
  scope: string | null;
  // True when the presented token(s) verified but were reported revoked by
  // the `is_token_revoked` hook; `user` is null whenever this is true.
  // Optional so third-party IRouteGuard implementations stay compatible.
  revoked?: boolean;
}
