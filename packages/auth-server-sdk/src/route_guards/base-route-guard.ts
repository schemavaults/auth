import type { UserData } from "@schemavaults/auth";
import type { InitRouteGuardCheckOptions } from "./init_route_guard_check_options";
import type { SchemaVaultsAppEnvironment } from "@schemavaults/app-definitions";

export interface IRouteGuard {
  isAccessAllowed: () => boolean;
  user: UserData | null;
}

export abstract class BaseRouteGuard implements IRouteGuard {
  protected _user: UserData | null;
  private readonly environment: SchemaVaultsAppEnvironment;

  public constructor({ user, environment }: InitRouteGuardCheckOptions) {
    this._user = user;
    this.environment = environment;
  }

  protected get isAuthenticated(): boolean {
    const isUserSet: boolean = !!this._user;
    if (this.environment !== "production") {
      console.debug("User is authenticated:", isUserSet, "User:", this._user);
    }
    return isUserSet;
  }

  protected get isAdmin(): boolean {
    return (
      this.isAuthenticated &&
      typeof this._user?.admin === "boolean" &&
      this._user.admin
    );
  }

  public abstract isAccessAllowed(): boolean;

  public get user(): UserData | null {
    return this._user;
  }
}
