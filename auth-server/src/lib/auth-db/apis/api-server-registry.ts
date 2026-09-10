import "server-only";

import { z } from "zod";

import { organizationIdSchema, type OrganizationID, type UserData } from "@schemavaults/auth-common";
import {
  schemaVaultsApiServerDefinitionSchema,
  type SchemaVaultsApiServerDefinition,
  schemaVaultsApiServerDomainRefSchema,
  type SchemaVaultsApiServerDomainRef,
  type ApiServerId,
  getHardcodedSchemaVaultsApis,
  getHardcodedApiDomains,
  type ResourceOwnership,
} from "@schemavaults/app-definitions";
import { getAuthServerOwnerOrganizationId } from "@/lib/config/auth-server-owner-organization";
import { ownershipFieldsFromDatabaseRow, toOwnershipDatabaseColumns } from "@/lib/ownership/ownership-columns";
import type { NewApiServer } from "./apis-table";
import { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import shouldEnableDebug from "@/lib/should-enable-debug";
import { listUserOrganizationMemberships } from "@/lib/auth-db/organizations/list-user-organization-memberships";
import { ConflictError } from "@/lib/error/ConflictError";
import {
  isHardcodedApiServerId,
  isValidApiServerId,
} from "@schemavaults/app-definitions";

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
        throw new Error("Expected hardcoded API servers to be owned by the configured owner organization!")
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

    const parsed_api_server =
      await schemaVaultsApiServerDefinitionSchema.safeParseAsync({
        ...first_row,
        created_at: createdAt,
        hardcoded: false,
        ...ownershipFieldsFromDatabaseRow(first_row),
      });
    if (!parsed_api_server.success) {
      console.error(parsed_api_server.error.issues);
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
          JSON.stringify(z.treeifyError(parsed.error), null, 2),
          "\nRaw row:",
          JSON.stringify(rows[index], null, 2),
        );
        throw new Error("Failed to parse API server domains from database");
      }
      return parsed.data;
    });
  }

  public async registerApiServer({
    api_server_id,
    api_server_name,
    api_server_description,
    publicly_listed,
    ownership,
    created_by = null,
  }: RegisterApiServerOptions): Promise<void> {
    if (!isValidApiServerId(api_server_id)) {
      throw new TypeError(
        "Received invalid API server ID!",
      );
    }

    if (
      ownership.owner_type === "organization" &&
      !organizationIdSchema.safeParse(ownership.owner_organization_id).success
    ) {
      throw new TypeError("Received invalid organization ID to register API server to!")
    }

    // Hardcoded API server ids (the auth server's own id, the reserved
    // OIDC userinfo audience) have no database row, so the insert's
    // uniqueness conflict cannot protect them — and a colliding row
    // would make listAllApiServers() throw. Reject them here.
    if (isHardcodedApiServerId(api_server_id)) {
      throw new ConflictError(
        `API server ID '${api_server_id}' is reserved by the platform`,
      );
    }

    const parsed_api_server =
      await schemaVaultsApiServerDefinitionSchema.safeParseAsync({
        api_server_id,
        api_server_name,
        api_server_description,
        created_at: Date.now(),
        public: publicly_listed ?? false,
        hardcoded: false,
        ...ownership,
        created_by,
      } satisfies SchemaVaultsApiServerDefinition);
    if (!parsed_api_server.success) {
      console.error(parsed_api_server.error.issues);
      throw new Error("Failed to parse API server definition");
    }
    const api_server: SchemaVaultsApiServerDefinition = parsed_api_server.data;

    const row: NewApiServer = {
      api_server_id: api_server.api_server_id,
      api_server_name: api_server.api_server_name,
      api_server_description: api_server.api_server_description,
      created_at: api_server.created_at,
      public: api_server.public,
      hardcoded: false,
      ...toOwnershipDatabaseColumns(ownership),
      created_by,
    };

    const result = await this.db
      .insertInto("api_servers")
      .values(row)
      .onConflict((oc) => oc.column("api_server_id").doNothing())
      .executeTakeFirst();

    if (result.numInsertedOrUpdatedRows === BigInt(0)) {
      throw new ConflictError("An API server with this ID already exists");
    }
  }

  /**
   * @description Lists every API server the user can reach by ownership:
   * those owned by their own account, those owned by organizations they
   * belong to (any role), and — for global admins — every API server
   * including platform-owned and hardcoded ones. Backs the `/apis` page.
   */
  public async listApiServersAccessibleToUser(
    user: UserData,
  ): Promise<readonly SchemaVaultsApiServerDefinition[]> {
    if (!user) {
      throw new Error("You must be logged in to list API servers");
    }
    if (user.admin === true) {
      return await this.listAllApiServers();
    }

    const memberships = await listUserOrganizationMemberships(
      this.db,
      user.uid,
      false,
    );
    const organization_ids: string[] = [
      ...new Set(memberships.map((m) => m.organization_id)),
    ];

    let rows: unknown[];
    try {
      rows = await this.db
        .selectFrom("api_servers")
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
        .limit(100)
        .selectAll()
        .execute();
    } catch (e: unknown) {
      console.error(`Failed to list API servers accessible to user '${user.uid}':`, e);
      throw new Error("Failed to list API servers accessible to user");
    }

    return await this.parseApiServerDefinitionsFromDbRows(rows);
  }

  /**
   * @description Lists the API servers owned directly by a user account
   * (`owner_type = 'user'`), independent of any organization membership.
   */
  public async listUserOwnedApiServers(
    uid: string,
  ): Promise<readonly SchemaVaultsApiServerDefinition[]> {
    if (typeof uid !== "string" || uid.length === 0) {
      throw new TypeError("Invalid user ID to list owned API servers for!");
    }

    let rows: unknown[];
    try {
      rows = await this.db
        .selectFrom("api_servers")
        .where("owner_type", "=", "user")
        .where("owner_uid", "=", uid)
        .orderBy("created_at", "desc")
        .limit(100)
        .selectAll()
        .execute();
    } catch (e: unknown) {
      console.error(`Failed to list API servers owned by user '${uid}':`, e);
      throw new Error("Failed to list API servers owned by user");
    }

    return await this.parseApiServerDefinitionsFromDbRows(rows);
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
            hardcoded: false,
            ...ownershipFieldsFromDatabaseRow(row),
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
      throw new Error("You must be logged in to list API servers");
    }


    const ownerOrganizationId: OrganizationID = getAuthServerOwnerOrganizationId();

    const loadOrgApiServerDefinitionsFromDb = async (organization_id: OrganizationID): Promise<readonly SchemaVaultsApiServerDefinition[]> => {
      let rows: unknown[];
      try {
        // The platform's virtual organization "owns" the platform-owned rows
        // (owner_type = 'platform'); user-owned rows also have a NULL owner
        // organization, so the discriminant — not the NULL — selects them.
        rows = await this.db
          .selectFrom("api_servers")
          .where((eb) =>
            organization_id === ownerOrganizationId
              ? eb("owner_type", "=", "platform")
              : eb.and([
                  eb("owner_type", "=", "organization"),
                  eb("owner_organization_id", "=", organization_id),
                ])
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

export interface RegisterApiServerOptions {
  api_server_id: string;
  api_server_name: string;
  api_server_description: string;
  publicly_listed: boolean;
  /** Who the API server belongs to; see `resolveRequestedOwnershipForCreation`. */
  ownership: ResourceOwnership;
  /** The creating user's uid, for the audit trail (null when unknown). */
  created_by?: string | null;
}

export default SchemaVaultsApiServerRegistry;
