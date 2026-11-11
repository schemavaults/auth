// The operation side of scopes: checking an operation's `requiredScopes` and
// collecting every scope a catalogue requires. Scope definitions themselves
// live in `@schemavaults/auth-common/scopes` (re-exported from the package
// root), so the client and server SDKs share them.
export { assertScopeRequirements } from "./assert-scope-requirements";
export { collectScopes } from "./collect-scopes";
export type { DocumentedScope } from "./collect-scopes";
