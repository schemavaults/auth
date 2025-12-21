import { BaseRouteGuard, type IRouteGuard } from "./base-route-guard";

export class AuthenticationRequiredRouteGuard
  extends BaseRouteGuard
  implements IRouteGuard
{
  public isAccessAllowed(): boolean {
    if (this.isAuthenticated) {
      return true;
    }

    return false;
  }
}

export default AuthenticationRequiredRouteGuard;
