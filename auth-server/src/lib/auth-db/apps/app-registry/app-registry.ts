import {
  type SchemaVaultsApp,
  listAppsQueryTypeSchema,
  type ListAppsQueryType,
  type SchemaVaultsAppDomainRef,
  schemaVaultsAppDefinitionSchema,
  schemaVaultsAppDomainRefSchema,
  HARDCODED_CORE_SCHEMAVAULTS_APPS,
  HARDCODED_CORE_SCHEMAVAULTS_APPS_MAP,
  appIdSchema,
  HARDCODED_CORE_SCHEMAVAULTS_APP_DOMAINS,
  type SchemaVaultsAppEnvironment,
  getAppEnvironment,
} from "@schemavaults/app-definitions";
import { organizationIdSchema, SCHEMAVAULTS_ORGANIZATION_ID, type OrganizationID, type UserData } from "@schemavaults/auth-common";
import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import { z } from "zod";

/**
 * @name SchemaVaultsAppRegistry
 * @description Manage available frontend client applications which can access SchemaVaults APIs
 * @see AuthorizedAppsRegistry To manage which apps a user has actually authorized
 * @see SchemaVaultsApiServerRegistry Backend API servers which frontend applications can actually access
 */
export class SchemaVaultsAppRegistry {
  private readonly env: SchemaVaultsAppEnvironment;
  private readonly debug: boolean;

  private hardcodedApps: Map<string, SchemaVaultsApp>;

  public async getApp(app_id: string): Promise<SchemaVaultsApp | null> {

    if (this.debug) {
      console.log(
        `[SchemaVaultsAppRegistry] Attempting to load app with ID: "${app_id}"`,
      );
    }

    if (this.hardcodedApps.has(app_id)) {
      if (this.debug) {
        console.log(
          `[SchemaVaultsAppRegistry] App ID '${app_id}' exists in hardcoded apps map`,
        );
      }
      const hardcoded_app: SchemaVaultsApp | undefined | null =
        this.hardcodedApps.get(app_id);
      if (hardcoded_app) {
        if (this.debug) {
          console.log(
            `[SchemaVaultsAppRegistry] Found hardcoded app with ID "${hardcoded_app.app_id}":`,
            hardcoded_app,
          );
        }
        return hardcoded_app;
      } else {
        throw new Error(
          "[SchemaVaultsAppRegistry] Value is falsy from hardcoded apps map",
        );
      }
    } else {
      if (this.debug) {
        console.log(
          "[SchemaVaultsAppRegistry] " +
            `App_id "${app_id}" was not found in hardcoded apps list, looking up in database...`,
        );
      }
    }

    let rows: object[];
    try {
      const query = this.db
        .selectFrom("apps")
        .where("app_id", "=", app_id)
        .limit(1)
        .selectAll();
      if (this.debug) {
        console.log(
          "[SchemaVaultsAppRegistry] " +
            `Executing query for app_id: "${app_id}"`,
        );
      }
      const result: object[] = await query.execute();
      if (this.debug) {
        console.log("[SchemaVaultsAppRegistry] getApp query result: ", result);
      }
      rows = result;
    } catch (e: unknown) {
      console.error("Failed to execute query for app in apps table: ", e);
      throw new Error("Error querying apps table of database");
    }
    if (rows.length === 0) {
      if (this.debug) {
        console.error("Requested app not found in apps table");
      }
      return null;
    } else if (rows.length > 1) {
      throw new Error("Multiple apps found with the same app_id");
    }
    console.assert(
      rows.length === 1,
      "Expected exactly one app record to have been retrieved from the database if this point was reached!",
    );

    const first_row = rows[0]!;
    if (!Object.hasOwn(first_row, "created_at")) {
      throw new Error("App row missing creation timestamp");
    }

    const createdAt: number = parseInt(
      (first_row as { created_at: string }).created_at,
    );
    if (isNaN(createdAt)) {
      throw new Error("Failed to parse created_at from database");
    }

    const parsed_app = await schemaVaultsAppDefinitionSchema.safeParseAsync({
      ...first_row,
      created_at: createdAt,
      hardcoded: false,
    });
    if (!parsed_app.success) {
      console.error(parsed_app.error.errors);
      if (this.debug) {
        console.error("Row that could not be parsed: ", first_row);
      }
      throw new Error("Failed to parse app definition from database");
    }
    return parsed_app.data;
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

  private static getHardcodedAppDomains(
    hardcoded_app_id: string,
  ): SchemaVaultsAppDomainRef[] {
    if (
      !HARDCODED_CORE_SCHEMAVAULTS_APPS.some(
        (app) => app.app_id === hardcoded_app_id,
      )
    ) {
      throw new Error(
        "Failed to find hardcoded SchemaVault app definition for specified app ID",
      );
    }

    return HARDCODED_CORE_SCHEMAVAULTS_APP_DOMAINS.filter(
      (domain) => domain.app_id === hardcoded_app_id,
    );
  }

  public async getAppDomains(
    app_id: string,
  ): Promise<SchemaVaultsAppDomainRef[]> {



    const isValidAppId: boolean = (await appIdSchema.safeParseAsync(app_id))
      .success;
    if (!isValidAppId) {
      throw new Error("Invalid app ID to list domains for!");
    }

    const isUuid: boolean = (await z.string().uuid().safeParseAsync(app_id))
      .success;
    const isHardcodedAppId: boolean = isValidAppId && !isUuid;

    if (isHardcodedAppId) {
      return SchemaVaultsAppRegistry.getHardcodedAppDomains(app_id);
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

  public async registerApp(
    app_id: string,
    app_name: string,
    app_description: string,
    publicly_listed: boolean,
    owner_organization_id: OrganizationID,
  ): Promise<void> {

    if (!organizationIdSchema.safeParse(owner_organization_id).success) {
      throw new TypeError("Received invalid organization ID to register application to!")
    }

    if (typeof publicly_listed !== 'boolean') {
      throw new TypeError("Expected 'publicly_listed' to be a boolean!")
    }

    const parsed_app = await schemaVaultsAppDefinitionSchema.safeParseAsync({
      app_id,
      app_name,
      app_description,
      created_at: Date.now(),
      public: publicly_listed ?? false,
      owner_organization_id: owner_organization_id === SCHEMAVAULTS_ORGANIZATION_ID ? null : owner_organization_id,
      hardcoded: false
    } satisfies SchemaVaultsApp);
    if (!parsed_app.success) {
      console.error(parsed_app.error.errors);
      throw new Error("Failed to parse app");
    }
    const app: SchemaVaultsApp = parsed_app.data;

    const insertAppQuery = this.db.insertInto("apps").values(app);

    await insertAppQuery.execute();
  }

  private parseAppDefinitionDatabaseRow(row: unknown): SchemaVaultsApp {
    if (typeof row !== "object" || !row)
      throw new Error("Expected row to be an object");
    if (!Object.hasOwn(row, "created_at") || !("created_at" in row)) {
      throw new Error("Missing app creation timestamp");
    }
    const created_at: number =
      typeof row.created_at === "string"
        ? parseInt(row.created_at)
        : Number(row.created_at);
    if (isNaN(created_at)) {
      throw new Error("Failed to parse created_at from database");
    }

    let owner_organization_id: string | undefined = (
      "owner_organization_id" in row && typeof row['owner_organization_id'] === 'string'
    ) ? (row.owner_organization_id) : SCHEMAVAULTS_ORGANIZATION_ID

    const parsed = schemaVaultsAppDefinitionSchema.safeParse({
      ...row,
      created_at,
      owner_organization_id
    });

    if (!parsed.success) {
      throw parsed.data;
    }

    return parsed.data;
  } // end of parseAppDefinitionDatabaseRow()

  public async listApps(
    type: Exclude<ListAppsQueryType, "authorized">,
    user: UserData,
  ): Promise<SchemaVaultsApp[]> {

    if (!user) {
      throw new Error("You must be logged in to list SchemaVaults apps");
    }
    if (type === "all" && !user.admin) {
      throw new Error("You must be an admin to list all SchemaVaults apps");
    }
    if (!(await listAppsQueryTypeSchema.safeParseAsync(type)).success) {
      throw new Error("Invalid apps query type");
    }
    if (type !== "all" && type !== "public") {
      throw new Error("Invalid apps query type for listing available apps");
    }

    if (this.debug) {
      console.log("[SchemaVaultsAppRegistry] Attempting to list apps...");
    }

    const MAX_PAGE_SIZE: number = 50;

    let query = this.db.selectFrom("apps");

    if (type === "public") {
      query = query.where("public", "=", true);
    }

    query = query.limit(MAX_PAGE_SIZE);

    const query_result: readonly SchemaVaultsApp[] = await query.selectAll().execute();

    if (!Array.isArray(query_result)) {
      throw new Error("Expected database query result to be an array of rows");
    }

    // result => transformed_output => transform => (actually) transformed_output
    const transformed_output: SchemaVaultsApp[] = [...query_result];

    // Add hardcoded apps to query result
    if (type === "all") {
      transformed_output.push(...HARDCODED_CORE_SCHEMAVAULTS_APPS);
    } else if (type === "public") {
      const hardcodedAppsLength: number =
        HARDCODED_CORE_SCHEMAVAULTS_APPS.length;
      transformed_output.push(
        ...HARDCODED_CORE_SCHEMAVAULTS_APPS.filter((a) => a.public),
      );
      if (this.debug) {
        console.log(
          `[SchemaVaultsAppRegistry] Number of public apps from database: ${query_result.length}`,
        );
        console.log(
          `[SchemaVaultsAppRegistry] Number of public hardcoded apps: ${hardcodedAppsLength}`,
        );
        console.log(
          `[SchemaVaultsAppRegistry] Number of apps after adding hardcoded apps : ${hardcodedAppsLength}`,
        );
      }
    } else {
      if (this.debug) {
        console.log("[SchemaVaultsAppRegistry] query type", type);
      }
    }

    try {
      const parsed = await schemaVaultsAppDefinitionSchema
        .array()
        .safeParseAsync(
          transformed_output.map(
            this.parseAppDefinitionDatabaseRow
          ),
        ); // end parsing app definitions array
      if (!parsed.success) throw parsed.error;
      return parsed.data;
    } catch (e: unknown) {
      console.error(e);
      throw new Error("Failed to parse the apps data received from database");
    }
  }

  public async listOrganizationApps(
    org_id: OrganizationID,
    user: UserData,
  ): Promise<readonly SchemaVaultsApp[]> {

    if (!organizationIdSchema.safeParse(org_id).success) {
      throw new TypeError("Invalid organization ID to list apps for!");
    }

    if (!user) {
      throw new Error("You must be logged in to list SchemaVaults apps");
    }

    if (this.debug) {
      console.log(
        `[SchemaVaultsAppRegistry] Attempting to list apps for organization: ${org_id}`,
      );
    }

    const MAX_PAGE_SIZE: number = 50;

    let result: SchemaVaultsApp[];
    try {
      result = await this.db
        .selectFrom("apps")
        .where("owner_organization_id", "=", org_id)
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

    if (org_id === SCHEMAVAULTS_ORGANIZATION_ID) {
      app_definitions.push(...HARDCODED_CORE_SCHEMAVAULTS_APPS.filter(s => s.owner_organization_id === SCHEMAVAULTS_ORGANIZATION_ID))
    }

    return app_definitions
  }

  public constructor(protected readonly db: Kysely<AuthDatabase>) {
    this.env = getAppEnvironment();
    this.debug =
      this.env === "development" ||
      this.env === "staging" ||
      this.env === "test";

    this.hardcodedApps = HARDCODED_CORE_SCHEMAVAULTS_APPS_MAP;
    if (this.debug) {
      console.log(
        "[SchemaVaultsAppRegistry] Initialize hardcoded apps:",
        this.hardcodedApps,
      );
    }
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
      await this.db.insertInto("app_domains").values(app_domain).execute();
    } catch (e: unknown) {
      console.error("Failed to add new app domain; db insert failed: ", e);
      throw new Error("Failed to add new app domain; db insert failed");
    }
  }
}

export default SchemaVaultsAppRegistry;
