import type { UserData } from "@schemavaults/auth-common";
import {
  schemaVaultsApiServerDefinitionSchema,
  type SchemaVaultsApiServerDefinition,
  schemaVaultsApiServerDomainRefSchema,
  type SchemaVaultsApiServerDomainRef,
  type ListApiServersQueryType,
  listApiServersQueryTypeSchema,
} from "@schemavaults/app-definitions";
import { Kysely, sql } from "@schemavaults/dbh";
import type { AuthDatabase } from "../auth-database-types";
import AbstractDatabaseResourceGroup from "@/lib/AbstractDatabaseResourceGroup";

/**
 * @name SchemaVaultsApiServerRegistry
 * @description Manage backend application servers
 * @see SchemaVaultsAppRegistry To manage the list of frontend applications
 * @see AuthorizedAppsRegistry To manage which frontend apps a user has actually authorized
 */
export class SchemaVaultsApiServerRegistry extends AbstractDatabaseResourceGroup {
  public async getApiServer(
    api_server_id: string,
  ): Promise<SchemaVaultsApiServerDefinition> {
    if (!(await this.hasBeenInitialized())) {
      await this.performSetupTasks();
    }

    const getApiServerQuery = this.db
      .selectFrom("api_servers")
      .where("api_server_id", "=", api_server_id)
      .selectAll()
      .limit(1);

    const rows = await getApiServerQuery.execute();
    if (rows.length === 0) {
      throw new Error("API Server not found");
    } else if (rows.length > 1) {
      throw new Error("Multiple API servers found with the same api_server_id");
    }

    console.assert(
      rows.length === 1,
      "Expected there to be exactly one API server row retrieved from the database if this point was reached!",
    );

    const first_row = rows[0]!;
    if (!Object.hasOwn(first_row, "created_at")) {
      throw new Error("Missing creation time in row data");
    }

    const createdAt: number =
      typeof first_row.created_at === "string"
        ? parseInt(first_row.created_at)
        : first_row.created_at;
    if (isNaN(createdAt)) {
      throw new Error("Failed to parse created_at from database");
    }

    const parsed_app =
      await schemaVaultsApiServerDefinitionSchema.safeParseAsync({
        ...first_row,
        created_at: createdAt,
      });
    if (!parsed_app.success) {
      console.error(parsed_app.error.errors);
      throw new Error("Failed to parse API server from database");
    }
    return parsed_app.data;
  }

  public async getApiServerDomains(
    api_server_id: string,
  ): Promise<SchemaVaultsApiServerDomainRef[]> {
    if (!(await this.hasBeenInitialized())) {
      await this.performSetupTasks();
    }

    const queryApiServers = this.db
      .selectFrom("api_server_domains")
      .where("api_server_id", "=", api_server_id)
      .limit(50)
      .selectAll();
    const rows = await queryApiServers.execute();
    const parsed_domains = await Promise.all(
      rows.map((row) =>
        schemaVaultsApiServerDomainRefSchema.safeParseAsync(row),
      ),
    );
    return parsed_domains.map((parsed) => {
      if (!parsed.success) {
        throw new Error("Failed to parse API server domains from database");
      }
      return parsed.data;
    });
  }

  public async registerApiServer(
    api_server_id: string,
    api_server_name: string,
    api_server_description: string,
    publicly_listed?: boolean,
  ): Promise<void> {
    if (!(await this.hasBeenInitialized())) {
      await this.performSetupTasks();
    }

    const parsed_app =
      await schemaVaultsApiServerDefinitionSchema.safeParseAsync({
        api_server_id,
        api_server_name,
        api_server_description,
        created_at: Date.now(),
        public: publicly_listed ?? false,
        hardcoded: false,
      } satisfies SchemaVaultsApiServerDefinition);
    if (!parsed_app.success) {
      console.error(parsed_app.error.errors);
      throw new Error("Failed to parse app");
    }
    const app: SchemaVaultsApiServerDefinition = parsed_app.data;

    await this.db.insertInto("api_servers").values(app).execute();
  }

  private static async setupApiServerRegistrySQLTables(
    db: Kysely<AuthDatabase>,
  ): Promise<void> {
    const createApiServersTable = sql`
      CREATE TABLE IF NOT EXISTS API_SERVERS (
        api_server_id UUID PRIMARY KEY,
        api_server_name TEXT NOT NULL,
        api_server_description TEXT NOT NULL,
        public BOOLEAN DEFAULT FALSE,
        created_at BIGINT NOT NULL,
        hardcoded BOOLEAN DEFAULT FALSE
      );
    `;
    await createApiServersTable.execute(db);
    const createApiServerDomainsTable = sql`
      CREATE TABLE IF NOT EXISTS API_SERVER_DOMAINS (
        api_server_domain_ref_id UUID PRIMARY KEY,
        api_server_id UUID NOT NULL,
        domain TEXT NOT NULL,
        environment TEXT NOT NULL,
        created_at BIGINT NOT NULL,
        hardcoded BOOLEAN DEFAULT FALSE,
        CONSTRAINT fk_api FOREIGN KEY (api_server_id) REFERENCES API_SERVERS(api_server_id) ON DELETE CASCADE
      );
    `;
    await createApiServerDomainsTable.execute(db);
  }

  public async listApiServers(
    type: ListApiServersQueryType,
    user: UserData,
  ): Promise<SchemaVaultsApiServerDefinition[]> {
    if (!this.hasBeenInitialized()) {
      await this.performSetupTasks();
    }

    if (!user)
      throw new Error("You must be logged in to list SchemaVaults API servers");
    if (type === "all" && !user.admin)
      throw new Error(
        "You must be an admin to list all SchemaVaults API servers",
      );
    if (!(await listApiServersQueryTypeSchema.safeParseAsync(type)).success)
      throw new Error("Invalid API servers query type");

    let rows: unknown[];
    try {
      if (type === "all") {
        rows = await this.db
          .selectFrom("api_servers")
          .limit(50)
          .selectAll()
          .execute();
      } else {
        throw new Error("Unhandled API servers query type");
      }
    } catch (e: unknown) {
      console.error(e);
      throw new Error("Failed to list API servers");
    }

    try {
      const parsed = await schemaVaultsApiServerDefinitionSchema
        .array()
        .safeParseAsync(
          rows.map((row) => {
            if (typeof row !== "object" || !row)
              throw new Error("Expected row to be an object");
            if (!Object.hasOwn(row, "created_at")) {
              throw new Error("Missing api server creation time");
            }
            const created_at: number = parseInt(
              (row as { created_at: string }).created_at,
            );
            if (isNaN(created_at)) {
              throw new Error("Failed to parse created_at from database");
            }

            return {
              ...row,
              created_at,
            };
          }),
        );
      if (!parsed.success) throw parsed.error;
      return parsed.data;
    } catch (e: unknown) {
      console.error(e);
      throw new Error(
        "Failed to parse the API servers data received from database",
      );
    }
  }

  public async setup(): Promise<void> {
    try {
      await SchemaVaultsApiServerRegistry.setupApiServerRegistrySQLTables(
        this.db,
      );
    } catch (e: unknown) {
      console.error(e);
      throw new Error("Failed to ensure that API servers tables were created");
    }
  }

  public constructor(protected db: Kysely<AuthDatabase>) {
    super(db);
  }

  public async performSetupTasks(): Promise<void> {
    return await this.setup();
  }

  public async hasBeenInitialized(): Promise<boolean> {
    if (this.initialized) {
      return true;
    }

    // Promises checking if SQL tables exist
    const apiServers: Promise<boolean> =
      this.hasTableBeenInitialized("api_servers");
    const apiServerDomains: Promise<boolean> =
      this.hasTableBeenInitialized("api_server_domains");

    const allTablesInitialized = await Promise.all([
      apiServers,
      apiServerDomains,
    ]);

    if (allTablesInitialized.every((e) => e)) {
      this.initialized = true;
      return true;
    }

    return false;
  }
}
