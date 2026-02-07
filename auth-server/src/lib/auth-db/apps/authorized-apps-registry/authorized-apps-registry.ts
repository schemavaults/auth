import "server-only";
import {
  type SchemaVaultsAppEnvironment,
  getAppEnvironment,
} from "@schemavaults/app-definitions";
import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import type { AuthorizedAppDeclaration } from "./authorized-app-declaration-schema";

export type { AuthorizedAppDeclaration } from './authorized-app-declaration-schema';

export class AuthorizedAppsRegistry {
  private readonly env: SchemaVaultsAppEnvironment;
  private readonly debug: boolean;

  public async listAuthorizedAppsForUser(uid: string): Promise<AuthorizedAppDeclaration[]> {
    const listAuthorizedAppsForUser = await import("./list-authorized-apps-for-user").then(mod => mod.default)
    return await listAuthorizedAppsForUser(this.db, uid, this.debug);
  }

  public async authorizeAppForUser(uid: string, app_id: string): Promise<void> {
    const authorizeAppForUser = await import('./authorize-app-for-user').then(mod => mod.default);
    return await authorizeAppForUser(this.db, uid, app_id, this.debug)
  }

  public async removeAppAuthorizationForUser(
    uid: string,
    app_id: string,
  ): Promise<void> {
    const removeAppAuthorizationForUser = await import("./remove-app-authorization-for-user").then(mod => mod.default);
    return await removeAppAuthorizationForUser(this.db, uid, app_id, this.debug);
  }

  public async isAppAuthorizedForUser(
    uid: string,
    app_id: string,
  ): Promise<boolean> {
    const isAppAuthorizedForUser = await import("./is-app-authorized-for-user").then(mod => mod.default);
    return await isAppAuthorizedForUser(this.db, uid, app_id, this.debug)
  }

  public constructor(protected readonly db: Kysely<AuthDatabase>) {
    this.env = getAppEnvironment();
    this.debug =
      this.env === "development" ||
      this.env === "staging" ||
      this.env === "test";
  }
}

export default AuthorizedAppsRegistry;
