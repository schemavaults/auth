/**
 * OAuth 2.0 scopes as first-class values: a scope is declared once, as a
 * {@link ScopeDefinition} saying what it allows, and that definition is
 * what everything else takes:
 *
 * - `@schemavaults/openapi-operations`: `requireAuth({ requiredScopes })`,
 *   the OpenAPI document's `x-schemavaults-scopes` and the docs UI;
 * - `@schemavaults/auth-client-sdk`: `login({ scope })` / `register()`, the
 *   client's `authorization_params.scope`, `sendAuthenticateRequest()`;
 * - `@schemavaults/auth-server-sdk`: route guards' `required_scopes`,
 *   `exchangeTokenForDelegatedToken({ scope })`, and a scope manifest
 *   (`syncApiServerScopes({ scopes })`), whose entries definitions are.
 *
 * Bare scope strings are accepted wherever a definition is. This module
 * (`@schemavaults/auth-common/scopes`) has no runtime dependencies, so
 * client components can import a scope catalogue without pulling zod in.
 */

/**
 * RFC 6749 §3.3 `scope-token`: one or more printable ASCII characters other
 * than space, `"` and `\`. A token's `scope` claim is a space separated list
 * of them, so a required scope outside this grammar could never be granted.
 */
export const SCOPE_TOKEN_REGEX: RegExp = /^[\x21\x23-\x5B\x5D-\x7E]+$/;

/** Whether `value` is a single RFC 6749 scope-token (e.g. `notes:read`, `email`). */
export function isScopeToken(value: unknown): value is string {
  return typeof value === "string" && SCOPE_TOKEN_REGEX.test(value);
}

/**
 * A scope value plus what it allows. Exactly `{ scope, description }`, the
 * shape of a SchemaVaults scope manifest entry, so a list of definitions can
 * be handed to `syncApiServerScopes({ scopes })` from
 * `@schemavaults/auth-server-sdk/api-scopes` as it is.
 */
export interface ScopeDefinition<TScope extends string = string> {
  /** The scope value as it appears in a token's space separated `scope` claim. */
  readonly scope: TScope;
  /**
   * What the scope lets a token do, written for the person granting it
   * ("Read your notes"): shown in API docs and, once synced, on the auth
   * server's consent screen.
   */
  readonly description: string;
}

/** A required scope: a bare scope value, or a {@link ScopeDefinition} describing it. */
export type ScopeRequirement<TScope extends string = string> = TScope | ScopeDefinition<TScope>;

export function isScopeDefinition(value: unknown): value is ScopeDefinition {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.scope === "string" && typeof record.description === "string";
}

/** The scope value of a requirement. */
export function scopeValue(requirement: ScopeRequirement): string {
  return typeof requirement === "string" ? requirement : requirement.scope;
}

/** The scope values of a list of requirements, in order (empty for `undefined`). */
export function scopeValues(requirements: readonly ScopeRequirement[] | undefined): string[] {
  return (requirements ?? []).map(scopeValue);
}

/**
 * Declares one scope. Throws a `TypeError` when the value is not a single
 * RFC 6749 scope-token or the description is blank; the description is
 * stored trimmed.
 *
 * ```ts
 * export const notesRead = defineScope({ scope: "notes:read", description: "Read your notes" });
 * ```
 */
export function defineScope<const TScope extends string>(
  definition: ScopeDefinition<TScope>,
): ScopeDefinition<TScope> {
  if (!isScopeToken(definition.scope)) {
    throw new TypeError(
      `Scope "${String(definition.scope)}" is not a single RFC 6749 scope-token (printable ASCII without spaces, '"' or '\\')`,
    );
  }
  if (typeof definition.description !== "string" || definition.description.trim().length === 0) {
    throw new TypeError(`Scope "${definition.scope}" needs a non-empty description`);
  }
  return Object.freeze({ scope: definition.scope, description: definition.description.trim() });
}

/** The result of {@link defineScopes}: the same keys, each a frozen {@link ScopeDefinition}. */
export type DefinedScopes<T extends Readonly<Record<string, ScopeDefinition>>> = {
  readonly [K in keyof T]: ScopeDefinition<T[K]["scope"]>;
};

/**
 * Declares an API's scopes at once, keyed by a name of your choosing, and
 * refuses a scope value listed twice:
 *
 * ```ts
 * export const notesScopes = defineScopes({
 *   read: { scope: "notes:read", description: "Read your notes" },
 *   write: { scope: "notes:write", description: "Create and edit your notes" },
 * });
 *
 * requireAuth({ schemes, requiredScopes: [notesScopes.read] });
 * ```
 *
 * `Object.values(notesScopes)` lists them all, e.g. for
 * `buildOpenApiDocument({ additionalScopes })` or a scope manifest.
 */
export function defineScopes<const T extends Readonly<Record<string, ScopeDefinition>>>(
  definitions: T,
): DefinedScopes<T> {
  const seen = new Map<string, string>();
  const result: Record<string, ScopeDefinition> = {};
  for (const [key, definition] of Object.entries(definitions)) {
    const defined = defineScope(definition);
    const previous = seen.get(defined.scope);
    if (previous !== undefined) {
      throw new TypeError(
        `Scope "${defined.scope}" is defined twice (as "${previous}" and "${key}")`,
      );
    }
    seen.set(defined.scope, key);
    result[key] = defined;
  }
  return Object.freeze(result) as DefinedScopes<T>;
}
