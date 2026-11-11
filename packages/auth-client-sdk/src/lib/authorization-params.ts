// authorization-params.ts
//
// The client's default authorization request (`authorization_params`): how
// it merges into each `login()` / `register()`, and whether a session's
// sign-in asked for everything it names (`needsReauthorization()`).

import {
  DEFAULT_AUTH_SCOPE,
  formatScope,
  isOidcReservedScope,
  isScopeDefinition,
  oidcScopeSchema,
  resourceIndicatorSchema,
  type ScopeInput,
} from "@schemavaults/auth-common";
import type {
  AuthorizationParams,
  SignInAuthorizationRequest,
} from "@/types/authorization-params";

/**
 * What a session's sign-in is taken to have asked for when the SDK has no
 * record of it (sessions signed in before sign-ins were recorded, or by an
 * adapter that cannot record them): the default scope, no resource.
 */
export const UNRECORDED_SIGN_IN_AUTHORIZATION_REQUEST: Readonly<SignInAuthorizationRequest> =
  Object.freeze({ scope: DEFAULT_AUTH_SCOPE, resource: null });

function scopeTokens(scope: string): string[] {
  return scope.split(" ").filter((token) => token.length > 0);
}

/**
 * The space-delimited wire form of a `scope` option: a string (normalized:
 * single spaces, repeated values dropped) or a list of scope values and
 * definitions. Null when the value is neither.
 */
export function scopeOptionToString(scope: unknown): string | null {
  if (typeof scope === "string") {
    return formatScope(scope);
  }
  if (
    Array.isArray(scope) &&
    scope.every((entry: unknown) => typeof entry === "string" || isScopeDefinition(entry))
  ) {
    return formatScope(scope as ScopeInput);
  }
  return null;
}

/**
 * Validates the client's `authorization_params` option. The scope (a string
 * or a list of scope values / definitions) is normalized to its
 * space-delimited form (single spaces, repeated tokens dropped).
 * @throws TypeError when it is malformed, or names API scopes without the
 * `resource` they belong to (the auth server would grant none of them).
 */
export function parseAuthorizationParams(
  value: unknown,
): AuthorizationParams | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(
      "Expected 'authorization_params' to be an object ({ scope?, resource? })",
    );
  }
  const { scope, resource } = value as Record<string, unknown>;
  const params: AuthorizationParams = {};

  if (scope !== undefined) {
    const normalized: string | null = scopeOptionToString(scope);
    if (normalized === null || !oidcScopeSchema.safeParse(normalized).success) {
      throw new TypeError(
        "Expected 'authorization_params.scope' to be a space-delimited list of RFC 6749 §3.3 scope tokens, or a non-empty list of scope values / definitions",
      );
    }
    params.scope = normalized;
  }

  if (resource !== undefined) {
    if (
      typeof resource !== "string" ||
      resource.trim() !== resource ||
      !resourceIndicatorSchema.safeParse(resource).success
    ) {
      throw new TypeError(
        "Expected 'authorization_params.resource' to be an API server id or the URL of one of its domains",
      );
    }
    params.resource = resource;
  }

  const api_scopes: string[] = scopeTokens(
    typeof params.scope === "string" ? params.scope : "",
  ).filter(
    (token) => !isOidcReservedScope(token),
  );
  if (api_scopes.length > 0 && params.resource === undefined) {
    throw new TypeError(
      `'authorization_params.scope' names API scopes (${api_scopes.join(", ")}) but no 'resource': name the API server they belong to, or the auth server grants none of them`,
    );
  }
  return params;
}

/**
 * The authorization request one sign-in makes: the call's own `scope` and
 * `resource`, each falling back to the client's `authorization_params`; the
 * scope defaults to DEFAULT_AUTH_SCOPE, and a list of scope values /
 * definitions becomes its space-delimited form (a string is sent as given).
 */
export function resolveSignInAuthorizationRequest(
  call: AuthorizationParams | undefined,
  defaults: AuthorizationParams | undefined,
): SignInAuthorizationRequest {
  const scope: ScopeInput | undefined = call?.scope ?? defaults?.scope;
  return {
    scope:
      scope === undefined || scope === null
        ? DEFAULT_AUTH_SCOPE
        : typeof scope === "string"
          ? scope
          : formatScope(scope),
    resource: call?.resource || defaults?.resource || null,
  };
}

/**
 * Whether a session whose sign-in made `session` asked for everything
 * `wanted` names: each of its scopes and, when it names API scopes, the same
 * resource. Sessions are judged by what their sign-in asked for, not by what
 * the user granted, so a user who declined a scope on the consent screen is
 * not sent back to it.
 */
export function isSignInAuthorizationRequestCovered(
  session: SignInAuthorizationRequest,
  wanted: SignInAuthorizationRequest,
): boolean {
  const asked: ReadonlySet<string> = new Set(scopeTokens(session.scope));
  const wanted_tokens: string[] = scopeTokens(wanted.scope);
  if (wanted_tokens.some((token) => !asked.has(token))) {
    return false;
  }
  const wants_api_scopes: boolean = wanted_tokens.some(
    (token) => !isOidcReservedScope(token),
  );
  return !wants_api_scopes || session.resource === wanted.resource;
}

/** A stored sign-in authorization request, or null when it is not one. */
export function parseSignInAuthorizationRequest(
  value: unknown,
): SignInAuthorizationRequest | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const { scope, resource } = value as Record<string, unknown>;
  if (typeof scope !== "string") {
    return null;
  }
  if (resource !== null && typeof resource !== "string") {
    return null;
  }
  return { scope, resource: resource || null };
}
