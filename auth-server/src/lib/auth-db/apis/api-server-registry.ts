import { organizationIdSchema, SCHEMAVAULTS_ORGANIZATION_ID, type OrganizationID, type UserData } from "@schemavaults/auth-common";
import {
  schemaVaultsApiServerDefinitionSchema,
  type SchemaVaultsApiServerDefinition,
  schemaVaultsApiServerDomainRefSchema,
  type SchemaVaultsApiServerDomainRef,
  HARDCODED_CORE_SCHEMAVAULTS_API_SERVERS,
  type ApiServerId,
  HARDCODED_CORE_SCHEMAVAULTS_API_SERVER_DOMAINS,
} from "@schemavaults/app-definitions";
import { Kysely, sql } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import AbstractDatabaseResourceGroup from "@/lib/auth-db/AbstractAuthServerDatabaseResourceGroup";
import { OrganizationsRegistry } from "@/lib/auth-db/organizations";
import shouldEnableDebug from "@/lib/should-enable-debug";
import isHardcodedApiServerId from "@/lib/isHardcodedApiServerId";

/**
 * @name SchemaVaultsApiServerRegistry
 * @description Manage backend application servers
 * @see SchemaVaultsAppRegistry To manage the list of frontend applications
 * @see AuthorizedAppsRegistry To manage which frontend apps a user has actually authorized
 */
export class SchemaVaultsApiServerRegistry extends AbstractDatabaseResourceGroup {
  private readonly debug: boolean;

  public constructor(protected db: Kysely<AuthDatabase>, initialized?: boolean, debug: boolean = shouldEnableDebug()) {
    super(db, initialized);
    this.debug = debug;
  }

  public async getApiServer(
    api_server_id: ApiServerId,
  ): Promise<SchemaVaultsApiServerDefinition> {
    if (!(await this.hasBeenInitialized())) {
      await this.performSetupTasks();
    }

    if (this.debug) {
      console.log(`[SchemaVaultsApiServerRegistry] getApiServer('${api_server_id}')`)
    }

    const hardcoded_api_server: SchemaVaultsApiServerDefinition | undefined = HARDCODED_CORE_SCHEMAVAULTS_API_SERVERS.find(hardcoded_api => {
      return hardcoded_api.api_server_id === api_server_id
    })
    if (hardcoded_api_server) {
      if (hardcoded_api_server.owner_organization_id !== SCHEMAVAULTS_ORGANIZATION_ID) {
        throw new Error("Expected hardcoded API servers to be owned by the hardcoded SchemaVaults organization!")
      }
      if (this.debug) {
        console.log(`[SchemaVaultsApiServerRegistry] getApiServer('${api_server_id}') -> Found hardcoded API: `, hardcoded_api_server)
      }
      return hardcoded_api_server satisfies SchemaVaultsApiServerDefinition;
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

    const parsed_api_server =
      await schemaVaultsApiServerDefinitionSchema.safeParseAsync({
        ...first_row,
        created_at: createdAt,
      });
    if (!parsed_api_server.success) {
      console.error(parsed_api_server.error.errors);
      throw new Error("Failed to parse API server from database");
    }
    const output: SchemaVaultsApiServerDefinition = parsed_api_server.data;

    if (this.debug) {
      console.log(`[SchemaVaultsApiServerRegistry] getApiServer('${api_server_id}') -> Loaded API from DB: `, output)
    }

    return output;
  }

  public async getApiServerDomains(
    api_server_id: ApiServerId,
  ): Promise<SchemaVaultsApiServerDomainRef[]> {
    if (!(await this.hasBeenInitialized())) {
      await this.performSetupTasks();
    }

    if (this.debug) {
      console.log(`[SchemaVaultsApiServerRegistry] getApiServerDomains('${api_server_id}')`)
    }

    if (isHardcodedApiServerId(api_server_id)) {
      return HARDCODED_CORE_SCHEMAVAULTS_API_SERVER_DOMAINS.filter(
        hardcoded_api_domain => hardcoded_api_domain.api_server_id === api_server_id
      )
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
    publicly_listed: boolean,
    owner_organization_id: OrganizationID,
  ): Promise<void> {
    if (!(await this.hasBeenInitialized())) {
      await this.performSetupTasks();
    }

    if (!organizationIdSchema.safeParse(owner_organization_id).success) {
      throw new TypeError("Received invalid organization ID to register API server to!")
    }

    const parsed_app =
      await schemaVaultsApiServerDefinitionSchema.safeParseAsync({
        api_server_id,
        api_server_name,
        api_server_description,
        created_at: Date.now(),
        public: publicly_listed ?? false,
        hardcoded: false,
        owner_organization_id: owner_organization_id === SCHEMAVAULTS_ORGANIZATION_ID ? null : owner_organization_id,
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
        hardcoded BOOLEAN DEFAULT FALSE,
        owner_organization_id TEXT,
        CONSTRAINT fk_owner_org
          FOREIGN KEY (owner_organization_id)
          REFERENCES ORGANIZATIONS(organization_id)
          ON DELETE CASCADE
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

  private async parseApiServerDefinitionsFromDbRows(rows: unknown[]): Promise<readonly SchemaVaultsApiServerDefinition[]> {
    const parsed = await schemaVaultsApiServerDefinitionSchema
      .array()
      .safeParseAsync(
        rows.map((row) => {
          if (typeof row !== "object" || !row)
            throw new Error("Expected row to be an object");
          if (!Object.hasOwn(row, "created_at")) {
            throw new Error("Missing api server creation time ('created_at')");
          }
          const created_at: number = parseInt(
            (row as { created_at: string }).created_at,
          );
          if (isNaN(created_at)) {
            throw new TypeError("Failed to parse 'created_at' from database");
          }

          return {
            ...row,
            created_at,
          };
        }),
      );
    if (!parsed.success) throw parsed.error;
    return parsed.data;
  }

  private async listAllApiServersFromDatabase(): Promise<readonly SchemaVaultsApiServerDefinition[]> {
    let rows: unknown[];
    try {
      rows = await this.db
        .selectFrom("api_servers")
        .limit(100)
        .selectAll()
        .execute();
    } catch (e: unknown) {
      console.error(e);
      throw new Error("Failed to list all API servers from database");
    }

    try {
      return await this.parseApiServerDefinitionsFromDbRows(rows);
    } catch (e: unknown) {
      console.error(e);
      throw new Error(
        "Failed to parse the API servers data received from database",
      );
    }
  }

  private listAllHardcodedApiServers(): readonly SchemaVaultsApiServerDefinition[] {
    return HARDCODED_CORE_SCHEMAVAULTS_API_SERVERS;
  }

  public async listAllApiServers(): Promise<readonly SchemaVaultsApiServerDefinition[]> {
    if (!await this.hasBeenInitialized()) {
      await this.performSetupTasks();
    }

    const all_api_servers: SchemaVaultsApiServerDefinition[] = []

    const hardcoded_api_servers: readonly SchemaVaultsApiServerDefinition[] = this.listAllHardcodedApiServers()
    const hardcodedApiServerIds: Set<string> = new Set(hardcoded_api_servers.map(srv => srv.api_server_id));

    const api_servers_from_db: readonly SchemaVaultsApiServerDefinition[] = await this.listAllApiServersFromDatabase()
    if (api_servers_from_db.some(db_api_server => hardcodedApiServerIds.has(db_api_server.api_server_id))) {
      throw new Error("API server ID from database conflicts with hardcoded API server definition!")
    }

    // Combine hardcoded + DB API servers
    all_api_servers.push(...hardcoded_api_servers);
    all_api_servers.push(...api_servers_from_db);
    return all_api_servers;
  }

  public async listOrganizationApiServers(
    org_id: OrganizationID,
    user: UserData,
  ): Promise<readonly SchemaVaultsApiServerDefinition[]> {
    if (!await this.hasBeenInitialized()) {
      await this.performSetupTasks();
    }

    if (!organizationIdSchema.safeParse(org_id).success) {
      throw new TypeError("Invalid organization ID to list API servers for!")
    }

    if (!user) {
      throw new Error("You must be logged in to list SchemaVaults API servers");
    }


    const loadOrgApiServerDefinitionsFromDb = async (organization_id: OrganizationID): Promise<readonly SchemaVaultsApiServerDefinition[]> => {
      let rows: unknown[];
      try {
        rows = await this.db
          .selectFrom("api_servers")
          .where("owner_organization_id", '=', organization_id)
          .limit(100)
          .selectAll()
          .execute();
      } catch (e: unknown) {
        console.error(`Failed to list API servers for organization with ID '${organization_id}':`, e);
        throw new Error(`Failed to list API servers for organization with ID: '${organization_id}'`);
      }

      return await this.parseApiServerDefinitionsFromDbRows(rows);
    }

    const api_server_definitions: SchemaVaultsApiServerDefinition[] = []

    try {
      api_server_definitions.push(...await loadOrgApiServerDefinitionsFromDb(org_id))
    } catch (e: unknown) {
      console.error(e);
      throw new Error(
        "Failed to parse the API servers data received from database",
      );
    }

    if (org_id === SCHEMAVAULTS_ORGANIZATION_ID) {
      api_server_definitions.push(...HARDCODED_CORE_SCHEMAVAULTS_API_SERVERS.filter(s => s.owner_organization_id === SCHEMAVAULTS_ORGANIZATION_ID))
    }

    return api_server_definitions;
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

  public async performSetupTasks(): Promise<void> {
    return await this.setup();
  }

  public async hasBeenInitialized(): Promise<boolean> {
    if (this.initialized) {
      return true;
    }

    const organizationsRegistry = new OrganizationsRegistry(this.db);
    const orgsRegistryInitialized: Promise<boolean> = organizationsRegistry.hasBeenInitialized()

    // Promises checking if SQL tables exist
    const apiServers: Promise<boolean> =
      this.hasTableBeenInitialized("api_servers");
    const apiServerDomains: Promise<boolean> =
      this.hasTableBeenInitialized("api_server_domains");

    if (!(await orgsRegistryInitialized)) {
      await organizationsRegistry.performSetupTasks();
    }

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

export default SchemaVaultsApiServerRegistry;
