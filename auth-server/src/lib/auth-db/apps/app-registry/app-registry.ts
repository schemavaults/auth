import "server-only";
import {
  type SchemaVaultsApp,
  type ListAppsQueryType,
  type SchemaVaultsAppDomainRef,
  type SchemaVaultsAppCallbackUrlRef,
  schemaVaultsAppDefinitionSchema,
  schemaVaultsAppDomainRefSchema,
  appIdSchema,
  type SchemaVaultsAppEnvironment,
  getAppEnvironment,
  isHardcodedAppId,
  getHardcodedSchemaVaultsApps,
  getHardcodedAppDomains,
  type AppId,
  type ResourceOwnership,
} from "@schemavaults/app-definitions";
import type { AppClientSecret } from "./app-client-secrets-table";
import { organizationIdSchema, type OrganizationID, type UserData } from "@schemavaults/auth-common";
import { getAuthServerOwnerOrganizationId } from "@/lib/config/auth-server-owner-organization";
import { toOwnershipDatabaseColumns } from "@/lib/ownership/ownership-columns";
import type { NewApp } from "./apps-table";
import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import { ConflictError } from "@/lib/error/ConflictError";
import listApps from "./list-apps";
import { listUserOrganizationMemberships } from "@/lib/auth-db/organizations/list-user-organization-memberships";
import parseAppDefinitionDatabaseRow from "./parse-app-definition-database-row";

/**
 * @name SchemaVaultsAppRegistry
 * @description Manage available frontend client applications which can access SchemaVaults APIs
 * @see AuthorizedAppsRegistry To manage which apps a user has actually authorized
 * @see SchemaVaultsApiServerRegistry Backend API servers which frontend applications can actually access
 */
export class SchemaVaultsAppRegistry {
  private readonly env: SchemaVaultsAppEnvironment;
  private readonly debug: boolean;

  public async getApp(app_id: string): Promise<SchemaVaultsApp | null> {
    const getApp = await import("./get-app").then(mod => mod.default)
    return await getApp(this.db, app_id, this.debug);
  }

  private static async parseAppDomainFromDb(
    row: object,
  ): Promise<SchemaVaultsAppDomainRef> {
    if (!Object.hasOwn(row, "created_at") || !("created_at" in row)) {
      throw new Error("Missing app domain creation time");
    }

    const created_at: number =
      typeof row.created_at === "string"
        ? parseInt(row.created_at)
        : Number(row.created_at);
    if (isNaN(created_at)) {
      throw new Error("Failed to parse app creation time from database");
    }

    const parsed_app_domain =
      await schemaVaultsAppDomainRefSchema.safeParseAsync({
        ...row,
        created_at,
      } as const);
    if (!parsed_app_domain.success) {
      console.error(parsed_app_domain.error);
      throw new Error("Failed to parse app domain from database!");
    }
    return parsed_app_domain.data satisfies SchemaVaultsAppDomainRef;
  }

  public async getAppDomains(
    app_id: AppId,
  ): Promise<readonly SchemaVaultsAppDomainRef[]> {
    const isValidAppId: boolean = (await appIdSchema.safeParseAsync(app_id))
      .success;
    if (!isValidAppId) {
      throw new Error("Invalid app ID to list domains for!");
    }

    if (isHardcodedAppId(app_id)) {
      return getHardcodedAppDomains(app_id);
    }

    const query = this.db
      .selectFrom("app_domains")
      .where("app_id", "=", app_id)
      .limit(50)
      .selectAll();
    const rows = await query.execute();

    const parse_domains_promises: Promise<SchemaVaultsAppDomainRef>[] =
      rows.map(SchemaVaultsAppRegistry.parseAppDomainFromDb);

    const parsed_domains: SchemaVaultsAppDomainRef[] = await Promise.all(
      parse_domains_promises,
    );

    return parsed_domains;
  }

  public async registerApp({
    app_id,
    app_name,
    app_description,
    publicly_listed,
    ownership,
    web,
    created_by = null,
  }: RegisterAppOptions): Promise<void> {

    if (typeof publicly_listed !== 'boolean') {
      throw new TypeError("Expected 'publicly_listed' to be a boolean!")
    }

    if (typeof web !== 'boolean') {
      throw new TypeError("Expected 'web' to be a boolean!")
    }

    if (
      ownership.owner_type === "organization" &&
      !organizationIdSchema.safeParse(ownership.owner_organization_id).success
    ) {
      throw new TypeError("Received invalid organization ID to register application to!")
    }

    // Hardcoded app ids (the auth server's own id) have no database row, so
    // the insert's uniqueness conflict cannot protect them. Reject them here.
    if (isHardcodedAppId(app_id)) {
      throw new ConflictError(`App ID '${app_id}' is reserved by the platform`);
    }

    // Validate the API-facing shape first (id/name/description limits, etc.)
    const parsed_app = await schemaVaultsAppDefinitionSchema.safeParseAsync({
      app_id,
      app_name,
      app_description,
      created_at: Date.now(),
      public: publicly_listed ?? false,
      hardcoded: false,
      web,
      ...ownership,
      created_by,
    } satisfies SchemaVaultsApp);
    if (!parsed_app.success) {
      console.error(parsed_app.error.issues);
      throw new Error("Failed to parse app");
    }
    const app: SchemaVaultsApp = parsed_app.data;

    const row: NewApp = {
      app_id: app.app_id,
      app_name: app.app_name,
      app_description: app.app_description,
      created_at: app.created_at,
      public: app.public,
      hardcoded: false,
      web: app.web,
      ...toOwnershipDatabaseColumns(ownership),
      created_by,
    };

    const result = await this.db
      .insertInto("apps")
      .values(row)
      .onConflict((oc) => oc.column("app_id").doNothing())
      .executeTakeFirst();

    if (result.numInsertedOrUpdatedRows === BigInt(0)) {
      throw new ConflictError("An app with this ID already exists");
    }
  }

  /**
   * @description Lists every app the user can reach by ownership: apps owned
   * by their own account, apps owned by organizations they belong to (any
   * role), and — for global admins — every app including platform-owned and
   * hardcoded ones. Backs the `/apps` page.
   */
  public async listAppsAccessibleToUser(
    user: UserData,
  ): Promise<SchemaVaultsApp[]> {
    if (!user) {
      throw new Error("You must be logged in to list apps");
    }
    if (user.admin === true) {
      return await this.listApps("all", user);
    }

    const memberships = await listUserOrganizationMemberships(
      this.db,
      user.uid,
      false,
    );
    const organization_ids: string[] = [
      ...new Set(memberships.map((m) => m.organization_id)),
    ];

    const MAX_PAGE_SIZE: number = 100;

    let rows: unknown[];
    try {
      rows = await this.db
        .selectFrom("apps")
        .where((eb) =>
          eb.or([
            eb.and([
              eb("owner_type", "=", "user"),
              eb("owner_uid", "=", user.uid),
            ]),
            ...(organization_ids.length > 0
              ? [
                  eb.and([
                    eb("owner_type", "=", "organization"),
                    eb("owner_organization_id", "in", organization_ids),
                  ]),
                ]
              : []),
          ]),
        )
        .orderBy("created_at", "desc")
        .limit(MAX_PAGE_SIZE)
        .selectAll()
        .execute();
    } catch (e: unknown) {
      console.error(`Failed to list apps accessible to user '${user.uid}':`, e);
      throw new Error("Failed to list apps accessible to user");
    }

    return rows.map(this.parseAppDefinitionDatabaseRow);
  }

  /**
   * @description Lists the apps owned directly by a user account
   * (`owner_type = 'user'`), independent of any organization membership.
   */
  public async listUserOwnedApps(uid: string): Promise<SchemaVaultsApp[]> {
    if (typeof uid !== "string" || uid.length === 0) {
      throw new TypeError("Invalid user ID to list owned apps for!");
    }

    const MAX_PAGE_SIZE: number = 50;

    let rows: unknown[];
    try {
      rows = await this.db
        .selectFrom("apps")
        .where("owner_type", "=", "user")
        .where("owner_uid", "=", uid)
        .orderBy("created_at", "desc")
        .limit(MAX_PAGE_SIZE)
        .selectAll()
        .execute();
    } catch (e: unknown) {
      console.error(`Failed to list apps owned by user '${uid}':`, e);
      throw new Error("Failed to list apps owned by user");
    }

    return rows.map(this.parseAppDefinitionDatabaseRow);
  }

  private parseAppDefinitionDatabaseRow(row: unknown): SchemaVaultsApp {
    return parseAppDefinitionDatabaseRow(row);
  } // end of parseAppDefinitionDatabaseRow()

  public async listApps(
    type: Exclude<ListAppsQueryType, "authorized">,
    user: UserData,
  ): Promise<SchemaVaultsApp[]> {
    return await listApps(this.db, type, user, this.debug);
  }

  public async listOrganizationApps(
    org_id: OrganizationID,
    user: UserData,
  ): Promise<readonly SchemaVaultsApp[]> {

    if (!organizationIdSchema.safeParse(org_id).success) {
      throw new TypeError("Invalid organization ID to list apps for!");
    }

    if (!user) {
      throw new Error("You must be logged in to list apps");
    }

    if (this.debug) {
      console.log(
        `[SchemaVaultsAppRegistry] Attempting to list apps for organization: ${org_id}`,
      );
    }

    const MAX_PAGE_SIZE: number = 50;
    const ownerOrganizationId: OrganizationID = getAuthServerOwnerOrganizationId();

    let result: unknown[];
    try {
      // The platform's virtual organization "owns" the platform-owned rows
      // (owner_type = 'platform'); user-owned rows also have a NULL owner
      // organization, so the discriminant — not the NULL — selects them.
      result = await this.db
        .selectFrom("apps")
        .where((eb) =>
          org_id === ownerOrganizationId
            ? eb("owner_type", "=", "platform")
            : eb.and([
                eb("owner_type", "=", "organization"),
                eb("owner_organization_id", "=", org_id),
              ])
        )
        .limit(MAX_PAGE_SIZE)
        .selectAll()
        .execute();
    } catch (e: unknown) {
      console.error(
        `Failed to list apps for organization with ID '${org_id}':`,
        e,
      );
      throw new Error(`Failed to list apps for organization with ID: '${org_id}'`);
    }

    if (!Array.isArray(result)) {
      throw new Error("Expected database query result to be an array of rows");
    }

    const app_definitions: SchemaVaultsApp[] = [];

    try {
      const parsed = await schemaVaultsAppDefinitionSchema
        .array()
        .safeParseAsync(
          result.map(this.parseAppDefinitionDatabaseRow),
        );
      if (!parsed.success) {
        throw parsed.error;
      }
      app_definitions.push(...parsed.data)
    } catch (e: unknown) {
      console.error(e);
      throw new Error(
        "Failed to parse the apps data received from database for organization",
      );
    }

    if (org_id === ownerOrganizationId) {
      app_definitions.push(...getHardcodedSchemaVaultsApps().filter(
        s => s.owner_organization_id === ownerOrganizationId
      ));
    }

    return app_definitions
  }

  public constructor(protected readonly db: Kysely<AuthDatabase>) {
    this.env = getAppEnvironment();
    this.debug =
      this.env === "development" ||
      this.env === "staging" ||
      this.env === "test";
  }

  public async deleteApp(app_id: string) {
    const fn = await import("./delete-app").then(m => m.default);
    return await fn(this.db, app_id);
  }

  public async getAppCallbackUrls(
    app_id: AppId,
  ): Promise<readonly SchemaVaultsAppCallbackUrlRef[]> {
    const fn = await import("./app-callback-urls").then(
      (m) => m.listAppCallbackUrls,
    );
    return await fn(this.db, app_id);
  }

  public async getAppCallbackUrlsForEnvironment(
    app_id: AppId,
    environment: SchemaVaultsAppEnvironment,
  ): Promise<readonly SchemaVaultsAppCallbackUrlRef[]> {
    const fn = await import("./app-callback-urls").then(
      (m) => m.listAppCallbackUrlsForEnvironment,
    );
    return await fn(this.db, app_id, environment);
  }

  public async addAppCallbackUrl(
    app_id: AppId,
    new_callback_url: SchemaVaultsAppCallbackUrlRef,
  ): Promise<void> {
    const fn = await import("./app-callback-urls").then(
      (m) => m.addAppCallbackUrl,
    );
    return await fn(this.db, app_id, new_callback_url);
  }

  public async removeAppCallbackUrl(
    app_id: AppId,
    app_callback_url_ref_id: string,
  ): Promise<boolean> {
    const fn = await import("./app-callback-urls").then(
      (m) => m.removeAppCallbackUrl,
    );
    return await fn(this.db, app_id, app_callback_url_ref_id);
  }

  public async getClientSecretRecord(
    app_id: AppId,
  ): Promise<AppClientSecret | null> {
    const fn = await import("./app-client-secrets").then(
      (m) => m.getAppClientSecretRecord,
    );
    return await fn(this.db, app_id);
  }

  public async setClientSecret(
    app_id: AppId,
    secret_hash: string,
    created_by: string | null,
  ): Promise<void> {
    const fn = await import("./app-client-secrets").then(
      (m) => m.setAppClientSecret,
    );
    return await fn(this.db, app_id, secret_hash, created_by);
  }

  public async deleteClientSecret(app_id: AppId): Promise<boolean> {
    const fn = await import("./app-client-secrets").then(
      (m) => m.deleteAppClientSecret,
    );
    return await fn(this.db, app_id);
  }

  public async addAppDomain(
    app_id: string,
    new_app_domain: SchemaVaultsAppDomainRef,
  ) {

    const parsed =
      await schemaVaultsAppDomainRefSchema.safeParseAsync(new_app_domain);
    if (!parsed.success) {
      throw new Error("Received invalid app domain to associate with app");
    }
    const app_domain = parsed.data;

    if (app_id !== app_domain.app_id) {
      throw new Error("App ID mismatch");
    }

    try {
      const result = await this.db
        .insertInto("app_domains")
        .values(app_domain)
        .onConflict((oc) => oc.column("app_domain_ref_id").doNothing())
        .executeTakeFirst();

      if (result.numInsertedOrUpdatedRows === BigInt(0)) {
        throw new ConflictError("This app domain already exists");
      }
    } catch (e: unknown) {
      if (e instanceof ConflictError) throw e;
      console.error("Failed to add new app domain; db insert failed: ", e);
      throw new Error("Failed to add new app domain; db insert failed");
    }
  }
}

export interface RegisterAppOptions {
  app_id: string;
  app_name: string;
  app_description: string;
  publicly_listed: boolean;
  /** Who the app belongs to; see `resolveRequestedOwnershipForCreation`. */
  ownership: ResourceOwnership;
  web: boolean;
  /** The creating user's uid, for the audit trail (null when unknown). */
  created_by?: string | null;
}

export default SchemaVaultsAppRegistry;
