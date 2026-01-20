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
export type * from "./withAuthenticatedRouteGuard";
export {
  withAdminServerComponentRouteGuard,
  withAdminApiRouteGuard,
} from "./withAdminRouteGuard";
export type * from "./withAdminRouteGuard";
