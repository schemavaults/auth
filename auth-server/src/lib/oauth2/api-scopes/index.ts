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

export { describeAppConsentStatus, toAppConsentStatus } from "./consent-status";
export type {
  DescribeAppConsentStatusOptions,
  DescribedAppConsentStatus,
} from "./consent-status";

export {
  splitTokenScopes,
  narrowGrantedScope,
  oidcPartOfGrantedScope,
} from "./token-scopes";
export type {
  SplitTokenScopesOptions,
  TokenScopes,
  NarrowedGrantScope,
} from "./token-scopes";
