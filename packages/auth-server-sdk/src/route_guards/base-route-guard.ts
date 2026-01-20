import type { OrganizationID, UserData } from "@schemavaults/auth-common";
import type { InitRouteGuardCheckOptions } from "./init_route_guard_check_options";
import type { SchemaVaultsAppEnvironment } from "@schemavaults/app-definitions";
import type { IRouteGuard } from "./IRouteGuard";
export type { IRouteGuard } from "./IRouteGuard";

export abstract class BaseRouteGuard implements IRouteGuard {
  protected readonly _user: UserData | null;
  protected readonly _orgs: readonly OrganizationID[];
  private readonly environment: SchemaVaultsAppEnvironment;

  public constructor({
    user,
    user_organizations,
    environment,
  }: InitRouteGuardCheckOptions) {
    this._user = user;
    this._orgs = user_organizations ?? [];
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

  public get user_organizations(): readonly OrganizationID[] {
    return this._orgs;
  }
}
