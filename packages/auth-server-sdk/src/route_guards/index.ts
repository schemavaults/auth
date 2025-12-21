export type { IRouteGuard } from "./base-route-guard";

export { AuthenticationRequiredRouteGuard } from "./authenticated";
export { AdminRequiredRouteGuard } from "./admin";

export {
  RouteGuardFactory,
  RouteGuardFactory as default,
} from "./route-guard-factory";
