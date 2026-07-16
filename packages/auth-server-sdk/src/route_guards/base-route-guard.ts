// base-route-guard.ts

import type { UserData } from "@schemavaults/auth-common";
import type { InitRouteGuardCheckOptions } from "./init_route_guard_check_options";
import type { SchemaVaultsAppEnvironment } from "@schemavaults/app-definitions";
import type { IRouteGuard } from "./IRouteGuard";
export type { IRouteGuard } from "./IRouteGuard";

export abstract class BaseRouteGuard implements IRouteGuard {
  protected readonly _user: UserData | null;
  protected readonly _scope: string | null;
  private readonly environment: SchemaVaultsAppEnvironment;

  public constructor({
    user,
    scope,
    environment,
  }: InitRouteGuardCheckOptions) {
    this._user = user;
    this._scope = scope ?? null;
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

  public get scope(): string | null {
    return this._scope;
  }
}
