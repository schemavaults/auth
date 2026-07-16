export { withAuthenticatedApiRouteGuard } from "./withAuthenticatedApiRouteGuard";
export type {
  TProtectedAuthenticatedApiRoute,
  IWithAuthenticatedApiRouteGuardAdditionalOptions,
} from "./withAuthenticatedApiRouteGuard";
export type { IBaseProtectedAuthenticatedApiRouteInputs } from "./IBaseProtectedAuthenticatedApiRouteInputs";

export { evaluateRequiredScopes } from "./evaluate-required-scopes";
export type { RequiredScopesEvaluation } from "./evaluate-required-scopes";

export { withAuthenticatedServerComponentRouteGuard } from "./withAuthenticatedServerComponentRouteGuard";
export type { TProtectedAuthenticatedPageServerComponent } from "./withAuthenticatedServerComponentRouteGuard";
export type { IBaseProtectedAuthenticatedServerComponentPageProps } from "./IBaseProtectedAuthenticatedServerComponentPageProps";

export { initDefaultJwtKeyManagerForAuthenticatedRouteGuard } from "./initDefaultJwtKeyManagerForAuthenticatedRouteGuard";
