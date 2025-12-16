import { z } from "zod";
import {
  appIdSchema,
  type SchemaVaultsApp,
  HARDCODED_CORE_SCHEMAVAULTS_APPS_MAP,
  HARDCODED_CORE_SCHEMAVAULTS_APPS,
  SCHEMAVAULTS_AUTH_APP_DEFINITION,
  type SchemaVaultsAppEnvironment,
  getAppEnvironment,
} from "@schemavaults/app-definitions";
import { Kysely, sql } from "@schemavaults/dbh";
import type { AuthDatabase } from "../../auth-database-types";
import { SchemaVaultsAppRegistry } from "../app-registry";
import AbstractDatabaseResourceGroup from "@/lib/AbstractDatabaseResourceGroup";

const authorizedAppDeclarationSchema = z
  .object({
    user_app_authorization_id: z.string().uuid(),
    app_id: appIdSchema,
    authorized_at: z.number().nonnegative(),
    uid: z.string().uuid(),
  })
  .required({
    user_app_authorization_id: true,
    app_id: true,
    authorized_at: true,
    uid: true,
  })
  .strict();

export type AuthorizedAppDeclaration = z.infer<
  typeof authorizedAppDeclarationSchema
>;

export class AuthorizedAppsRegistry extends AbstractDatabaseResourceGroup {
  protected async hasAuthorizedAppsTableBeenInitialized(): Promise<boolean> {
    const tableExists = sql`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'authorized_apps'
      ) AS exists;
    `.execute(this.db);

    const result = await tableExists;
    const exists: boolean =
      typeof result.rows[0] === "object" &&
      result.rows[0] !== null &&
      "exists" in result.rows[0] &&
      !!result.rows[0].exists;
    return exists;
  }

  public async hasBeenInitialized(): Promise<boolean> {
    if (this.initialized) {
      return true;
    }

    return await this.hasAuthorizedAppsTableBeenInitialized();
  }

  public async performSetupTasks(): Promise<void> {
    if (!(await this.appRegistry.hasBeenInitialized())) {
      await this.appRegistry.performSetupTasks();
    }
    return await this.setup();
  }

  private readonly env: SchemaVaultsAppEnvironment;
  private readonly debug: boolean;
  private hardcodedApps: Map<string, SchemaVaultsApp> =
    HARDCODED_CORE_SCHEMAVAULTS_APPS_MAP;

  private appRegistry: SchemaVaultsAppRegistry;

  private async setupAuthorizedAppsRegistrySQLTables(): Promise<void> {
    if (
      this.env === "development" ||
      this.env === "test" ||
      this.env === "staging"
    ) {
      console.log(
        "[AuthorizedAppsRegistry] Setting up authorized apps table...",
      );
    }
    const createAuthorizedAppsTable = sql`
      CREATE TABLE IF NOT EXISTS AUTHORIZED_APPS (
        user_app_authorization_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        app_id UUID NOT NULL,
        uid UUID NOT NULL,
        authorized_at BIGINT NOT NULL CHECK (authorized_at > 0),
        CONSTRAINT fk_app FOREIGN KEY (app_id) REFERENCES apps(app_id) ON DELETE CASCADE,
        CONSTRAINT fk_user FOREIGN KEY (uid) REFERENCES users(uid) ON DELETE CASCADE,
        UNIQUE (app_id, uid)
      );
    `;
    await createAuthorizedAppsTable.execute(this.db);
    if (this.env === "development") {
      console.log("[AuthorizedAppsRegistry] Set up authorized apps table.");
    }
  }

  public async setup(): Promise<void> {
    if (this.initialized) {
      if (this.debug) {
        console.log("Authorized apps registry is already set up");
      }
      return;
    }

    if (!(await this.appRegistry.hasBeenInitialized())) {
      await this.appRegistry.performSetupTasks();
    }

    try {
      await Promise.all([
        this.setupAuthorizedAppsRegistrySQLTables(),
        // UserRegistry.setup()
      ]);
    } catch (e: unknown) {
      console.error(e);
      throw new Error(
        "Failed to ensure that app & user registry were set up before setting up authorized user apps registry",
      );
    }

    if (this.debug) {
      console.log("Authorized apps registry is now set up.");
    }

    this.initialized = true;
  }

  public async listAuthorizedAppsForUser(
    uid: string,
  ): Promise<AuthorizedAppDeclaration[]> {
    if (this.debug) {
      console.log(
        "[AuthorizedAppsRegistry] Attempting to list authorized apps for user: ",
        uid,
      );
    }

    if (!(await this.hasBeenInitialized())) {
      await this.performSetupTasks();
    }

    if (typeof uid !== "string")
      throw new Error("Expected user ID to be a string");
    const parsed_uid = await z.string().uuid().safeParseAsync(uid);
    if (!parsed_uid.success) throw new Error("Received invalid user ID");

    let rows: unknown[];
    try {
      const authorizedAppsForUser = await this.db
        .selectFrom("authorized_apps")
        .where("uid", "=", parsed_uid.data)
        .limit(50)
        .selectAll()
        .execute();
      if (this.env === "development") {
        console.log(
          "[AuthorizedAppsRegistry] Received rows from DB: ",
          authorizedAppsForUser,
        );
      }
      rows = authorizedAppsForUser;
    } catch (e: unknown) {
      console.error("Query to get authorized apps failed: ", e);
      throw new Error("Failed to query for user's authorized apps by uid");
    }

    try {
      const parsed = await authorizedAppDeclarationSchema
        .array()
        .safeParseAsync(
          rows.map((row) => {
            if (typeof row !== "object" || !row)
              throw new Error("Expected each row to be an object");
            if (!Object.hasOwn(row, "authorized_at")) {
              throw new Error(
                "Expected each query row to have an 'authorized_at' property",
              );
            }
            const authorized_at = Number.parseInt(
              (row as { authorized_at: string }).authorized_at,
            );
            if (isNaN(authorized_at))
              throw new Error(
                "Failed to parse authentication time for app in authorized apps registry",
              );
            return {
              ...row,
              authorized_at,
            };
          }),
        );
      if (!parsed.success) throw parsed.error;
      const authorized_apps: readonly AuthorizedAppDeclaration[] = parsed.data;

      // Also, include the hardcoded apps
      const fake_authorizations_for_hardcoded: readonly AuthorizedAppDeclaration[] =
        HARDCODED_CORE_SCHEMAVAULTS_APPS.map(
          function createFakeAuthorizationForCoreSchemaVaultsApp(
            hardcoded_app: SchemaVaultsApp,
          ): AuthorizedAppDeclaration {
            return {
              app_id: hardcoded_app.app_id,
              authorized_at: Date.now(),
              uid,
              user_app_authorization_id: crypto.randomUUID(),
            };
          },
        );

      return [
        ...authorized_apps,
        ...fake_authorizations_for_hardcoded,
      ] as const satisfies AuthorizedAppDeclaration[];
    } catch (e: unknown) {
      console.error(e);
      throw new Error("Failed to parse list of authorized apps from database");
    }
  }

  public async authorizeAppForUser(uid: string, app_id: string): Promise<void> {
    if (this.hardcodedApps.has(app_id)) {
      throw new Error(
        `Hardcoded app "${app_id}" is already authorized by default`,
      );
    }

    if (!(await this.hasBeenInitialized())) {
      await this.performSetupTasks();
    }

    if (typeof uid !== "string")
      throw new Error("Expected user ID to be a string");
    const parsed_uid = await z.string().uuid().safeParseAsync(uid);
    if (!parsed_uid.success) {
      throw new Error("Received invalid user ID");
    }

    if (typeof app_id !== "string") {
      throw new Error("Expected app ID to be a string");
    }
    const parsed_app_id = await appIdSchema.safeParseAsync(app_id);
    if (!parsed_app_id.success) throw new Error("Received invalid app ID");

    try {
      const now = Date.now();
      await this.db
        .insertInto("authorized_apps")
        .values({
          app_id: parsed_app_id.data,
          uid: parsed_uid.data,
          authorized_at: now,
        })
        .execute();
    } catch (e: unknown) {
      console.error(
        "Failed to insert authorized app record into database: ",
        e,
      );
      throw new Error("Failed to insert authorized app record into database!");
    }

    if (this.debug) {
      console.log(
        `Authorized app ${parsed_app_id.data} for user ${parsed_uid.data} at ${Date.now()}`,
      );
    }
  }

  public async removeAppAuthorizationForUser(
    uid: string,
    app_id: string,
  ): Promise<void> {
    if (this.hardcodedApps.has(app_id)) {
      throw new Error(
        `Hardcoded app "${app_id}" is fixed as authorized by default`,
      );
    }

    if (
      this.env === "development" ||
      this.env === "test" ||
      this.env === "staging"
    ) {
      await this.setup();
    }

    if (typeof uid !== "string")
      throw new Error("Expected user ID to be a string");
    const parsed_uid = await z.string().uuid().safeParseAsync(uid);
    if (!parsed_uid.success) throw new Error("Received invalid user ID");

    if (typeof app_id !== "string")
      throw new Error("Expected app ID to be a string");
    const parsed_app_id = await appIdSchema.safeParseAsync(app_id);
    if (!parsed_app_id.success) throw new Error("Received invalid app ID");

    throw new Error("Unimplemented");
  }

  private async getAppAuthorization(
    uid: string,
    app_id: string,
  ): Promise<AuthorizedAppDeclaration | null> {
    if (this.hardcodedApps.has(app_id)) {
      const hardcoded_app = this.hardcodedApps.get(app_id);
      if (!hardcoded_app)
        throw new Error("Matching hardcoded app for app_id has falsy value");
      return {
        uid,
        user_app_authorization_id: crypto.randomUUID(),
        app_id,
        authorized_at: Date.now() - 1,
      } satisfies AuthorizedAppDeclaration;
    }

    if (
      this.env === "development" ||
      this.env === "test" ||
      this.env === "staging"
    ) {
      await this.setup();
    }

    if (typeof uid !== "string")
      throw new Error("Expected user ID to be a string");
    const parsed_uid = await z.string().uuid().safeParseAsync(uid);
    if (!parsed_uid.success) throw new Error("Received invalid user ID");

    if (typeof app_id !== "string")
      throw new Error("Expected app ID to be a string");
    const parsed_app_id = await appIdSchema.safeParseAsync(app_id);
    if (!parsed_app_id.success) throw new Error("Received invalid app ID");

    let rows: unknown[];
    try {
      rows = await this.db
        .selectFrom("authorized_apps")
        .where("uid", "=", parsed_uid.data)
        .where("app_id", "=", parsed_app_id.data)
        .limit(1)
        .selectAll()
        .execute();
    } catch (e: unknown) {
      console.error(e);
      throw new Error("Failed to query for user's authorized apps by uid");
    }

    try {
      const parsed = await authorizedAppDeclarationSchema
        .array()
        .safeParseAsync(
          rows.map((row) => {
            if (typeof row !== "object" || !row) {
              throw new Error("Expected each row to be an object");
            }
            if (!Object.hasOwn(row, "authorized_at")) {
              throw new Error(
                "Expected each query row to have an 'authorized_at' property",
              );
            }
            const authorized_at_str = (row as { authorized_at: string })
              .authorized_at;
            const parsed = Number.parseInt(authorized_at_str);
            if (isNaN(parsed))
              throw new Error(
                "Failed to parse 'authorized_at' property for authorized app",
              );
            return {
              ...row,
              authorized_at: parsed,
            };
          }),
        );
      if (!parsed.success) {
        throw parsed.error;
      }
      if (parsed.data.length === 0) {
        return null;
      }
      const appAuthorizationRecord: AuthorizedAppDeclaration | undefined =
        parsed.data[0];
      if (!appAuthorizationRecord) {
        return null;
      }

      return appAuthorizationRecord satisfies AuthorizedAppDeclaration;
    } catch (e: unknown) {
      console.error(e);
      throw new Error("Failed to parse list of authorized apps from database");
    }
  }

  public async isAppAuthorizedForUser(
    uid: string,
    app_id: string,
  ): Promise<boolean> {
    if (!(await this.hasBeenInitialized())) {
      await this.performSetupTasks();
    }

    if (app_id === SCHEMAVAULTS_AUTH_APP_DEFINITION.app_id) {
      return true;
    }

    try {
      const appAuthorization = await this.getAppAuthorization(uid, app_id);
      if (!appAuthorization) return false;
      if (this.env === "development") {
        console.log(
          `[AuthorizedAppsRegistry] User with ID "${uid}" has authorized application with ID "${app_id}"`,
        );
      }
      return true;
    } catch (e: unknown) {
      console.error(
        "[AuthorizedAppsRegistry] Failed to check if app is authorized for user: ",
        e,
      );
      throw new Error(
        "Failed to find authorization record for specified app id and user id",
      );
    }
  }

  public constructor(protected db: Kysely<AuthDatabase>) {
    super(db);
    this.env = getAppEnvironment();
    this.debug =
      this.env === "development" ||
      this.env === "staging" ||
      this.env === "test";

    this.appRegistry = new SchemaVaultsAppRegistry(db);
  }
}
