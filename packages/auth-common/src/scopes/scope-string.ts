import { scopeValues, type ScopeRequirement } from "./scope-definition";

/**
 * A scope as SDK options take it: the space-delimited wire form
 * (`"openid notes:read"`), or a list of scope values and definitions
 * (`[oidcScopes.openid, notesScopes.read]`).
 */
export type ScopeInput = string | readonly ScopeRequirement[];

/** A granted scope: a token's space-delimited `scope` claim, or its values. */
export type GrantedScopeInput = string | readonly string[] | null | undefined;

function splitScope(value: string): string[] {
  return value.split(/\s+/).filter((token) => token.length > 0);
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

/**
 * The values of a scope, in order and each once: a space-delimited string
 * (RFC 6749 §3.3) is split, a list is taken as it is. `null` / `undefined`
 * (a token without a `scope` claim) is the empty scope.
 */
export function parseScope(scope: GrantedScopeInput): string[] {
  if (scope === null || scope === undefined) return [];
  return unique(typeof scope === "string" ? splitScope(scope) : scope.flatMap(splitScope));
}

/**
 * The space-delimited wire form of a scope (RFC 6749 §3.3): its values
 * joined by single spaces, in order, each once. An empty list is `""`.
 *
 * ```ts
 * formatScope([oidcScopes.openid, notesScopes.read, "email"]); // "openid notes:read email"
 * ```
 */
export function formatScope(scope: ScopeInput): string {
  return parseScope(typeof scope === "string" ? scope : scopeValues(scope)).join(" ");
}

/** The `required` scope values the granted scope lacks, in order. */
export function missingFromScope(
  granted: GrantedScopeInput,
  required: readonly ScopeRequirement[],
): string[] {
  const values = new Set(parseScope(granted));
  return scopeValues(required).filter((scope) => !values.has(scope));
}

/**
 * Whether the granted scope includes every one of the required scopes
 * (values or definitions). With none required it is true, even for a token
 * without a scope claim.
 */
export function scopeIncludes(
  granted: GrantedScopeInput,
  ...required: readonly ScopeRequirement[]
): boolean {
  return missingFromScope(granted, required).length === 0;
}
