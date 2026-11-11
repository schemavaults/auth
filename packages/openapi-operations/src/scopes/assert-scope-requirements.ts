import { isScopeDefinition, isScopeToken, scopeValue, type ScopeRequirement } from "./scope-definition";

/**
 * Checks an operation's `requiredScopes` when it is declared
 * (`requireAuth()`): a list of scope-tokens or {@link ScopeDefinition}s
 * with no scope value repeated. Throws a `TypeError` naming the problem.
 */
export function assertScopeRequirements(requirements: unknown): void {
  if (requirements === undefined) return;
  if (!Array.isArray(requirements)) {
    throw new TypeError("requiredScopes must be a list of scope values or scope definitions");
  }
  const seen = new Set<string>();
  for (const requirement of requirements as unknown[]) {
    if (typeof requirement !== "string" && !isScopeDefinition(requirement)) {
      throw new TypeError(
        `requiredScopes entries must be scope values or { scope, description } definitions (got ${JSON.stringify(requirement)})`,
      );
    }
    const value = scopeValue(requirement as ScopeRequirement);
    if (!isScopeToken(value)) {
      throw new TypeError(
        `Required scope "${value}" is not a single RFC 6749 scope-token (printable ASCII without spaces, '"' or '\\'); list each scope separately`,
      );
    }
    if (seen.has(value)) {
      throw new TypeError(`Required scope "${value}" listed twice`);
    }
    seen.add(value);
  }
}
