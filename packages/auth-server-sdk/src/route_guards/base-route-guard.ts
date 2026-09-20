// base-route-guard.ts

import type { UserData } from "@schemavaults/auth-common";
import type { InitRouteGuardCheckOptions } from "./init_route_guard_check_options";
import type { SchemaVaultsAppEnvironment } from "@schemavaults/app-definitions";
import type { IRouteGuard } from "./IRouteGuard";
export type { IRouteGuard } from "./IRouteGuard";

export abstract class BaseRouteGuard implements IRouteGuard {
  protected readonly _user: UserData | null;
  protected readonly _scope: string | null;
  protected readonly _revoked: boolean;
  private readonly environment: SchemaVaultsAppEnvironment;

  public constructor({
    user,
    scope,
    revoked,
    environment,
  }: InitRouteGuardCheckOptions) {
    this._revoked = revoked === true;
    // A revoked credential never resolves a user, whatever the caller passed.
    this._user = this._revoked ? null : user;
    this._scope = this._revoked ? null : (scope ?? null);
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

  public get revoked(): boolean {
    return this._revoked;
  }
}
