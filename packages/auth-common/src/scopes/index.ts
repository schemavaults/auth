// `@schemavaults/auth-common/scopes`: scope definitions and scope-string
// helpers with no runtime dependencies (no zod), safe in client bundles.
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
export { oidcScopes } from "./oidc-scopes";
export { parseScope, formatScope, missingFromScope, scopeIncludes } from "./scope-string";
export type { GrantedScopeInput, ScopeInput } from "./scope-string";
export {
  OIDC_OPENID_SCOPE,
  OIDC_SUPPORTED_SCOPES,
  OIDC_RESERVED_SCOPES,
  isOidcReservedScope,
} from "../oidc/scope-names";
export type { OidcReservedScope } from "../oidc/scope-names";
