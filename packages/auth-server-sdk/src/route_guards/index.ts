export type { IRouteGuard } from "./IRouteGuard";

export { AuthenticationRequiredRouteGuard } from "./authenticated";
export { AdminRequiredRouteGuard } from "./admin";

export {
  RouteGuardFactory,
  RouteGuardFactory as default,
} from "./route-guard-factory";

export {
  withAuthenticatedServerComponentRouteGuard,
  withAuthenticatedApiRouteGuard,
} from "./withAuthenticatedRouteGuard";
export type {
  TProtectedAuthenticatedPageServerComponent,
  TProtectedAuthenticatedApiRoute,
  IBaseProtectedAuthenticatedServerComponentPageProps,
  IBaseProtectedAuthenticatedApiRouteInputs,
} from "./withAuthenticatedRouteGuard";

export {
  withAdminServerComponentRouteGuard,
  withAdminApiRouteGuard,
} from "./withAdminRouteGuard";
export type {
  TProtectedAdminPageServerComponent,
  TProtectedAdminApiRoute,
  IBaseProtectedAdminServerComponentPageProps,
  IBaseProtectedAdminApiRouteInputs,
} from "./withAdminRouteGuard";
