import type { SchemaVaultsAppEnvironment } from "@schemavaults/app-definitions";
import type { UserData } from "@schemavaults/auth-common";

export interface InitRouteGuardCheckOptions {
  user: UserData | null;
  // Granted scope from the resolving token, carried alongside `user`.
  // Optional so callers that build a guard from an already-resolved user
  // (RouteGuardFactory.createGuardFromOptions) can omit it — it defaults to
  // null (no scopes granted).
  scope?: string | null;
  // True when a token that verified cryptographically was rejected by the
  // `is_token_revoked` hook (logout / password reset). `user` is null in
  // that case; guards use the flag to report "revoked" rather than
  // "unauthenticated". Defaults to false.
  revoked?: boolean;
  environment: SchemaVaultsAppEnvironment;
}
