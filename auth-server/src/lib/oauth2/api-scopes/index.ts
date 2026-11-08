export { resolveGrantResource } from "./resolve-grant-resource";
export type {
  ResolvedGrantResource,
  ResolveGrantResourceOptions,
} from "./resolve-grant-resource";

export { resolveAuthorizationCodeGrant } from "./resolve-authorization-code-grant";
export type {
  ResolvedAuthorizationCodeGrant,
  ResolveAuthorizationCodeGrantOptions,
} from "./resolve-authorization-code-grant";

export { listUsableApiScopeValues } from "./usable-api-scopes";

export { decideApiScopeConsent, isConsentScreenRequired } from "./api-scope-consent";
export type {
  DecideApiScopeConsentOptions,
  ApiScopeConsentDecision,
  IsConsentScreenRequiredOptions,
} from "./api-scope-consent";

export { describeAppConsentStatus, toAppConsentStatus } from "./consent-status";
export type {
  DescribeAppConsentStatusOptions,
  DescribedAppConsentStatus,
} from "./consent-status";

export {
  splitTokenScopes,
  splitRefreshGrantTokenScopes,
  narrowGrantedScope,
  oidcPartOfGrantedScope,
} from "./token-scopes";
export type {
  SplitTokenScopesOptions,
  SplitRefreshGrantTokenScopesOptions,
  TokenScopes,
  NarrowedGrantScope,
} from "./token-scopes";
