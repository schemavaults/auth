import type { AnyOperationDefinition } from "../operation";
import { scopeValue, type ScopeRequirement } from "./scope-definition";

/**
 * A scope as the OpenAPI document lists it (`x-schemavaults-scopes`): its
 * value, and its description when some operation (or `additionalScopes`)
 * gave a {@link ScopeDefinition} for it.
 */
export interface DocumentedScope {
  readonly scope: string;
  readonly description?: string;
}

/**
 * Every distinct scope the operations require, plus `additional` ones (listed
 * first, e.g. the API's whole `defineScopes()` catalogue, for scopes only a
 * handler checks), in first-seen order. A bare string is upgraded by a
 * definition of the same value found later; two definitions of one value
 * with different descriptions throw a `TypeError`, so a scope is described
 * the same way everywhere.
 */
export function collectScopes(
  operations: readonly AnyOperationDefinition[],
  additional: readonly ScopeRequirement[] = [],
): DocumentedScope[] {
  const byValue = new Map<string, DocumentedScope>();
  const add = (requirement: ScopeRequirement): void => {
    const scope = scopeValue(requirement);
    const description = typeof requirement === "string" ? undefined : requirement.description;
    const existing = byValue.get(scope);
    if (existing === undefined) {
      byValue.set(scope, description === undefined ? { scope } : { scope, description });
      return;
    }
    if (description === undefined || existing.description === description) return;
    if (existing.description !== undefined) {
      throw new TypeError(
        `Scope "${scope}" is defined twice with different descriptions ("${existing.description}" and "${description}")`,
      );
    }
    byValue.set(scope, { scope, description });
  };
  for (const requirement of additional) add(requirement);
  for (const operation of operations) {
    if (operation.auth.type !== "required") continue;
    for (const requirement of operation.auth.requiredScopes ?? []) add(requirement);
  }
  return [...byValue.values()];
}
