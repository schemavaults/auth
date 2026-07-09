import "server-only";

import { organizationIdSchema, type OrganizationID, type UserData } from "@schemavaults/auth-common";
import {
  schemaVaultsApiServerDefinitionSchema,
  type SchemaVaultsApiServerDefinition,
  schemaVaultsApiServerDomainRefSchema,
  type SchemaVaultsApiServerDomainRef,
  type ApiServerId,
  getHardcodedSchemaVaultsApis,
  getHardcodedApiDomains,
} from "@schemavaults/app-definitions";
import { getAuthServerOwnerOrganizationId } from "@/lib/config/auth-server-owner-organization";
import { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import shouldEnableDebug from "@/lib/should-enable-debug";
import { ConflictError } from "@/lib/error/ConflictError";
import { isHardcodedApiServerId } from "@schemavaults/app-definitions";

/**
 * @name SchemaVaultsApiServerRegistry
 * @description Manage backend application servers
 * @see SchemaVaultsAppRegistry To manage the list of frontend applications
 * @see AuthorizedAppsRegistry To manage which frontend apps a user has actually authorized
 */
export class SchemaVaultsApiServerRegistry {
  private readonly debug: boolean;

  public constructor(protected readonly db: Kysely<AuthDatabase>, debug: boolean = shouldEnableDebug()) {
    this.debug = debug;
  }

  public async getApiServer(
    api_server_id: ApiServerId,
  ): Promise<SchemaVaultsApiServerDefinition | null> {
    if (this.debug) {
      console.log(`[SchemaVaultsApiServerRegistry] getApiServer('${api_server_id}')`)
    }

    const hardcoded_api_server: SchemaVaultsApiServerDefinition | undefined = getHardcodedSchemaVaultsApis().find(hardcoded_api => {
      return hardcoded_api.api_server_id === api_server_id
    })
    if (hardcoded_api_server) {
      if (hardcoded_api_server.owner_organization_id !== getAuthServerOwnerOrganizationId()) {
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
      return null;
    } else if (rows.length > 1) {
      throw new Error("Multiple API servers found with the same api_server_id");
    }

    if (rows.length !== 1 || !rows[0] || typeof rows[0] !== 'object') {
      throw new Error("Expected there to be exactly one API server row retrieved from the database if this point was reached!");
    }

    const first_row = rows[0];
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

    const owner_organization_id: OrganizationID = (
      "owner_organization_id" in first_row && typeof first_row['owner_organization_id'] === 'string'
    ) ? first_row['owner_organization_id'] : getAuthServerOwnerOrganizationId();

    const parsed_api_server =
      await schemaVaultsApiServerDefinitionSchema.safeParseAsync({
        ...first_row,
        created_at: createdAt,
        owner_organization_id,
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
  ): Promise<readonly SchemaVaultsApiServerDomainRef[]> {

    if (this.debug) {
      console.log(`[SchemaVaultsApiServerRegistry] getApiServerDomains('${api_server_id}')`)
    }

    if (isHardcodedApiServerId(api_server_id)) {
      return getHardcodedApiDomains(api_server_id);
    }

    const queryApiServers = this.db
      .selectFrom("api_server_domains")
      .where("api_server_id", "=", api_server_id)
      .limit(50)
      .selectAll();
    const rows = await queryApiServers.execute();
    const parsed_domains = await Promise.all(
      rows.map((row) => {
        const createdAt: number =
          typeof row.created_at === "string"
            ? parseInt(row.created_at)
            : row.created_at;
        if (isNaN(createdAt)) {
          throw new Error(
            "Failed to parse created_at for API server domain from database",
          );
        }
        return schemaVaultsApiServerDomainRefSchema.safeParseAsync({
          ...row,
          created_at: createdAt,
        });
      }),
    );
    return parsed_domains.map((parsed, index) => {
      if (!parsed.success) {
        console.error(
          `Failed to parse API server domain from database (row ${index}):`,
          JSON.stringify(parsed.error.format(), null, 2),
          "\nRaw row:",
          JSON.stringify(rows[index], null, 2),
        );
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
        owner_organization_id: owner_organization_id === getAuthServerOwnerOrganizationId() ? null : owner_organization_id,
      } satisfies SchemaVaultsApiServerDefinition);
    if (!parsed_app.success) {
      console.error(parsed_app.error.errors);
      throw new Error("Failed to parse app");
    }
    const app: SchemaVaultsApiServerDefinition = parsed_app.data;

    const result = await this.db
      .insertInto("api_servers")
      .values(app)
      .onConflict((oc) => oc.column("api_server_id").doNothing())
      .executeTakeFirst();

    if (result.numInsertedOrUpdatedRows === BigInt(0)) {
      throw new ConflictError("An API server with this ID already exists");
    }
  }

  private async parseApiServerDefinitionsFromDbRows(rows: unknown[]): Promise<readonly SchemaVaultsApiServerDefinition[]> {
    const ownerOrganizationId: OrganizationID = getAuthServerOwnerOrganizationId();
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

          const owner_organization_id: OrganizationID = (
            "owner_organization_id" in row && typeof row['owner_organization_id'] === 'string'
          ) ? row['owner_organization_id'] : ownerOrganizationId;

          return {
            ...row,
            created_at,
            owner_organization_id
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
    return getHardcodedSchemaVaultsApis();
  }

  public async listAllApiServers(): Promise<readonly SchemaVaultsApiServerDefinition[]> {
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

  public async deleteApiServer(api_server_id: ApiServerId) {
    const fn = await import("./delete-api-server").then(m => m.default);
    return await fn(this.db, api_server_id);
  }

  public async addApiServerDomain(
    api_server_id: string,
    new_domain: SchemaVaultsApiServerDomainRef,
  ): Promise<void> {
    const parsed =
      await schemaVaultsApiServerDomainRefSchema.safeParseAsync(new_domain);
    if (!parsed.success) {
      throw new Error("Received invalid API server domain to associate with API server");
    }
    const domain = parsed.data;

    if (api_server_id !== domain.api_server_id) {
      throw new Error("API server ID mismatch");
    }

    try {
      const result = await this.db
        .insertInto("api_server_domains")
        .values(domain)
        .onConflict((oc) => oc.column("api_server_domain_ref_id").doNothing())
        .executeTakeFirst();

      if (result.numInsertedOrUpdatedRows === BigInt(0)) {
        throw new ConflictError("This API server domain already exists");
      }
    } catch (e: unknown) {
      if (e instanceof ConflictError) throw e;
      console.error("Failed to add new API server domain; db insert failed: ", e);
      throw new Error("Failed to add new API server domain; db insert failed");
    }
  }

  public async listOrganizationApiServers(
    org_id: OrganizationID,
    user: UserData,
  ): Promise<readonly SchemaVaultsApiServerDefinition[]> {

    if (!organizationIdSchema.safeParse(org_id).success) {
      throw new TypeError("Invalid organization ID to list API servers for!")
    }

    if (!user) {
      throw new Error("You must be logged in to list SchemaVaults API servers");
    }


    const ownerOrganizationId: OrganizationID = getAuthServerOwnerOrganizationId();

    const loadOrgApiServerDefinitionsFromDb = async (organization_id: OrganizationID): Promise<readonly SchemaVaultsApiServerDefinition[]> => {
      let rows: unknown[];
      try {
        rows = await this.db
          .selectFrom("api_servers")
          .where((eb) =>
            organization_id === ownerOrganizationId
              ? eb.or([
                  eb("owner_organization_id", "=", organization_id),
                  eb("owner_organization_id", "is", null),
                ])
              : eb("owner_organization_id", "=", organization_id)
          )
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

    if (org_id === ownerOrganizationId) {
      api_server_definitions.push(...getHardcodedSchemaVaultsApis().filter(s => s.owner_organization_id === ownerOrganizationId))
    }

    return api_server_definitions;
  }
}

export default SchemaVaultsApiServerRegistry;
