import type { UserData } from "@schemavaults/auth";
import { BaseRouteGuard, type IRouteGuard } from "./base-route-guard";


export class AdminRequiredRouteGuard extends BaseRouteGuard implements IRouteGuard {
  public isAccessAllowed(): boolean {
    if ((this._user satisfies UserData | null) && this.isAuthenticated && this.isAdmin) {
      return true;
    }

    return false;
  }
}
