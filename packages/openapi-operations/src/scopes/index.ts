// `@schemavaults/openapi-operations/scopes`: scope definitions without the
// rest of the package (no zod / hono), safe to import from client components.
export {
  SCOPE_TOKEN_REGEX,
  isScopeToken,
  isScopeDefinition,
  scopeValue,
  scopeValues,
  defineScope,
  defineScopes,
} from "./scope-definition";
export type { DefinedScopes, ScopeDefinition, ScopeRequirement } from "./scope-definition";
export { assertScopeRequirements } from "./assert-scope-requirements";
export { collectScopes } from "./collect-scopes";
export type { DocumentedScope } from "./collect-scopes";
export { oidcScopes } from "./oidc-scopes";
