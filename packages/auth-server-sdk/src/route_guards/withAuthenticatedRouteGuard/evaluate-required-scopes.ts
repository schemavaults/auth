import { OIDC_SUPPORTED_SCOPES } from "@schemavaults/auth-common";

export type RequiredScopesEvaluation =
  | { ok: true }
  | {
      ok: false;
      /**
       * `invalid_config`: the route declared a scope outside
       * OIDC_SUPPORTED_SCOPES — a server misconfiguration (500).
       * `missing_scopes`: the token's grant does not cover the
       * requirement (403).
       */
      reason: "invalid_config" | "missing_scopes";
      scopes: string[];
    };

/**
 * Pure evaluation of a route's `required_scopes` against the
 * space-delimited `scope` claim carried on the presented token (threaded
 * alongside the user as `IRouteGuard.scope`, never folded into UserData).
 * A token without a scope claim — issued before scopes became
 * first-class — grants NO scopes. There is deliberately no admin bypass:
 * scope describes what the token was granted, not who the user is.
 */
export function evaluateRequiredScopes(
  token_scope: string | undefined,
  required_scopes: readonly string[],
): RequiredScopesEvaluation {
  const invalid_configured_scopes: string[] = required_scopes.filter(
    (scope) => !(OIDC_SUPPORTED_SCOPES as readonly string[]).includes(scope),
  );
  if (invalid_configured_scopes.length > 0) {
    return {
      ok: false,
      reason: "invalid_config",
      scopes: invalid_configured_scopes,
    };
  }

  const granted_scopes = new Set((token_scope ?? "").split(" ").filter(Boolean));
  const missing_scopes: string[] = required_scopes.filter(
    (scope) => !granted_scopes.has(scope),
  );
  if (missing_scopes.length > 0) {
    return { ok: false, reason: "missing_scopes", scopes: missing_scopes };
  }

  return { ok: true };
}

export default evaluateRequiredScopes;
