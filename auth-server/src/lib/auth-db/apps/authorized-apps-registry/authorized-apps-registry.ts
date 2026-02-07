import "server-only";
import { z } from "zod";
import {
  appIdSchema,
  type SchemaVaultsApp,
  HARDCODED_CORE_SCHEMAVAULTS_APPS_MAP,
  SCHEMAVAULTS_AUTH_APP_DEFINITION,
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
  private hardcodedApps: Map<string, SchemaVaultsApp> =
    HARDCODED_CORE_SCHEMAVAULTS_APPS_MAP;

  public async listAuthorizedAppsForRegistry(uid: string): Promise<AuthorizedAppDeclaration[]> {
    const listAuthorizedApps = await import("./list-authorized-apps-for-registry").then(mod => mod.default)
    return await listAuthorizedApps(this.db, uid, this.debug);
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
