import { sql, type Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "../auth-database-types";
import {
  getAppEnvironment,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import type { IOrganizationsRegistry } from "./IOrganizationsRegistry";
import {
  type OrganizationDefinition,
  organizationDefinitionSchema,
  type OrganizationID,
  organizationIdSchema,
  SCHEMAVAULTS_ORGANIZATION_ID,
  hardcodedOrgs
} from "@schemavaults/auth-common";
import type { OrganizationRow } from "./organizations-table";
import isValidUuid from "@/lib/is-valid-uuid";
import {
  isValidOrganizationMembershipRoleType,
  type OrganizationMembershipRoleType,
} from "./organization-membership-role-types";
import AbstractDatabaseResourceGroup from "@/lib/auth-db/AbstractAuthServerDatabaseResourceGroup";
import type { OrganizationMemberWithUserData } from "./organization-member-with-user-data";

export class OrganizationsRegistry
  extends AbstractDatabaseResourceGroup
  implements IOrganizationsRegistry
{
  private readonly hardcodedOrganizations: Map<string, OrganizationDefinition> = new Map(hardcodedOrgs.map(hardcodedOrg => [hardcodedOrg.organization_id, hardcodedOrg]))

  public async hasBeenInitialized(): Promise<boolean> {
    if (this.initialized) {
      return true;
    }
    const tablesInitializedPromises = await Promise.all([
      this.hasTableBeenInitialized("organizations"),
      this.hasTableBeenInitialized("organaization_membership_roles"),
    ]);

    const initialized: boolean =
      tablesInitializedPromises[0] && tablesInitializedPromises[1];

    if (initialized) {
      this.initialized = true;
      return true;
    }
    return false;
  }

  public async performSetupTasks(): Promise<void> {
    if (this.initialized) {
      return;
    }
    await this.setup();
    this.initialized = true;
  }
  private readonly env: SchemaVaultsAppEnvironment;
  private readonly debug: boolean;

  private static async setupOrganizationsSQLTable(
    db: Kysely<AuthDatabase>,
  ): Promise<void> {
    const createOrganizationsTableSql = sql`
      CREATE TABLE IF NOT EXISTS ORGANIZATIONS (
        organization_id TEXT PRIMARY KEY,
        created_at BIGINT NOT NULL,
        name TEXT NOT NULL
      );
    `;

    await createOrganizationsTableSql.execute(db);
  }

  private static async setupOrganizationMembershipRolesSQLTable(
    db: Kysely<AuthDatabase>,
  ): Promise<void> {
    const createOrganizationMembershipRolesTableSql = sql`
      CREATE TABLE IF NOT EXISTS ORGANIZATION_MEMBERSHIP_ROLES (
        membership_declaration_id UUID PRIMARY KEY,
        organization_id TEXT NOT NULL,
        uid UUID NOT NULL,
        created_at BIGINT NOT NULL,
        role TEXT NOT NULL,
        CONSTRAINT fk_user FOREIGN KEY (uid) REFERENCES USERS(uid) ON DELETE CASCADE,
        CONSTRAINT fk_org FOREIGN KEY (organization_id) REFERENCES ORGANIZATIONS(organization_id) ON DELETE CASCADE,
        UNIQUE (organization_id, uid, role)
      );
    `;

    await createOrganizationMembershipRolesTableSql.execute(db);
  }

  private static async setup(db: Kysely<AuthDatabase>): Promise<void> {
    await OrganizationsRegistry.setupOrganizationsSQLTable(db);
    await OrganizationsRegistry.setupOrganizationMembershipRolesSQLTable(db);
  }

  protected async setup(): Promise<void> {
    await OrganizationsRegistry.setup(this.db);
  }

  public constructor(
    protected readonly db: Kysely<AuthDatabase>,
    debug: boolean | undefined = undefined,
  ) {
    super(db);
    this.env = getAppEnvironment();

    const defaultDebugState: boolean =
      this.env === "development" ||
      this.env === "staging" ||
      this.env === "test";

    this.debug = typeof debug === "boolean" ? debug : defaultDebugState;
    this.db = db;
  }

  public async lookupOrganization(
    org_id: OrganizationID,
  ): Promise<OrganizationDefinition> {
    if (!(await this.hasBeenInitialized())) {
      await this.performSetupTasks();
    }

    const parsed_org_id = await organizationIdSchema.safeParseAsync(org_id);
    if (!parsed_org_id.success) {
      throw new Error(
        "OrganizationsRegistry.lookupOrganization() received invalid organization ID!",
      );
    }
    const organization_id: OrganizationID = parsed_org_id.data;

    if (this.debug) {
      console.log(
        `[OrganizationsRegistry] lookupOrganization(org_id = '${org_id}')`,
      );
    }

    const getHardcodedOrg = (): OrganizationDefinition | null => {
      if (!this.hardcodedOrganizations.has(organization_id)) {
        return null;
      }
      const hardcodedOrganization = this.hardcodedOrganizations.get(organization_id);
      return hardcodedOrganization ?? null;
    }
    const hardcodedOrg: OrganizationDefinition | null = getHardcodedOrg();
    if (hardcodedOrg) {
      if (this.debug) {
        console.log(
          `[OrganizationsRegistry] lookupOrganization(org_id = '${org_id}') => Hardcoded Org: `,
          hardcodedOrg,
        );
      }
      return hardcodedOrg;
    }

    const db = this.db;
    async function loadOrganizationFromDatabase(): Promise<OrganizationDefinition> {
      const lookupOrgQuery = db
        .selectFrom("organizations")
        .where("organization_id", "=", organization_id)
        .selectAll()
        .limit(1);

      const orgDefinition: OrganizationRow =
        await lookupOrgQuery.executeTakeFirstOrThrow();
      const parsed_org_def = await organizationDefinitionSchema.safeParseAsync({
        ...orgDefinition,
        created_at:
          typeof orgDefinition.created_at === "number"
            ? orgDefinition.created_at
            : Number.parseInt(orgDefinition.created_at),
      } satisfies OrganizationDefinition);
      if (!parsed_org_def.success) {
        console.error(
          "Failed to parse organization definition from database row: ",
          parsed_org_def.error,
        );
        throw new Error(
          "Failed to parse organization definition from database row!",
        );
      }
      const output: OrganizationDefinition = parsed_org_def.data;
      return output;
    }

    try {
      const org: OrganizationDefinition = await loadOrganizationFromDatabase()
      if (this.debug) {
        console.log(
          `[OrganizationsRegistry] lookupOrganization(org_id = '${org_id}') => `,
          org,
        );
      }
      return org;
    } catch (e: unknown) {
      console.error("Error looking up organization from database:", e)
      throw new Error("Error looking up organization from database!")
    }
  }

  public async createOrganization(
    org_def: OrganizationDefinition,
  ): Promise<void> {
    if (!(await this.hasBeenInitialized())) {
      await this.performSetupTasks();
    }

    const parsedOrgDef =
      await organizationDefinitionSchema.safeParseAsync(org_def);
    if (!parsedOrgDef.success) {
      console.error(
        "Failed to parse organization definition for database insert: ",
        parsedOrgDef.error,
      );
      throw new Error(
        "Failed to parse organization definition for database insert!",
      );
    }
    const organization_definition: OrganizationDefinition = parsedOrgDef.data;

    if (
      organization_definition.organization_id === SCHEMAVAULTS_ORGANIZATION_ID
    ) {
      throw new Error(
        `'${SCHEMAVAULTS_ORGANIZATION_ID}' is a reserved organization ID!`,
      );
    }

    if (hardcodedOrgs.some(hardcodedOrganization => hardcodedOrganization.organization_id === organization_definition.organization_id)) {
      throw new Error(
        `'${organization_definition.organization_id}' is a reserved organization ID!`,
      );
    }

    if (this.debug) {
      console.log(
        `[OrganizationsRegistry] createOrganization(${JSON.stringify(organization_definition)})`,
      );
    }

    const insertionQuery = this.db
      .insertInto("organizations")
      .values(organization_definition);

    await insertionQuery.executeTakeFirstOrThrow();
  }

  public async listAllOrganizations(): Promise<readonly OrganizationDefinition[]> {
    if (!(await this.hasBeenInitialized())) {
      await this.performSetupTasks();
    }

    if (this.debug) {
      console.log(`[OrganizationsRegistry] listAllOrganizations()`);
    }

    const query = this.db
      .selectFrom("organizations")
      .selectAll()
      .orderBy("created_at", "desc");

    const rows: OrganizationRow[] = await query.execute();

    const organizations: OrganizationDefinition[] = [];
    for (const row of rows) {
      const parsed = await organizationDefinitionSchema.safeParseAsync({
        ...row,
        created_at:
          typeof row.created_at === "number"
            ? row.created_at
            : Number.parseInt(row.created_at),
      } satisfies OrganizationDefinition);
      if (!parsed.success) {
        console.error(
          "Failed to parse organization definition from database row: ",
          parsed.error,
        );
        continue;
      }
      organizations.push(parsed.data);
    }

    organizations.push(...hardcodedOrgs satisfies readonly OrganizationDefinition[]);

    if (this.debug) {
      console.log(
        `[OrganizationsRegistry] listAllOrganizations() => ${organizations.length} organizations`,
      );
    }

    return organizations;
  }

  public async listUserOrganizationMemberships(
    uid: string,
  ): Promise<readonly OrganizationID[]> {
    if (!(await this.hasBeenInitialized())) {
      await this.performSetupTasks();
    }

    if (!isValidUuid(uid)) {
      throw new Error(
        "Invalid user ID to lookup organization memberships for!",
      );
    }

    if (this.debug) {
      console.log(
        `[OrganizationsRegistry] listUserOrganizationMemberships(uid = '${uid}')`,
      );
    }

    let organization_ids: readonly OrganizationID[];
    try {
      const membershipsQuery = this.db
        .selectFrom("organization_membership_roles")
        .where("uid", "=", uid)
        .select("organization_id");

      const memberships = await membershipsQuery.execute();
      if (memberships.length === 0) {
        if (this.debug) {
          console.log(
            `[OrganizationsRegistry] listUserOrganizationMemberships(uid = '${uid}') -> []`,
          );
        }
        return [];
      }
      const all_organization_ids = memberships.map((result) => {
        if (!organizationIdSchema.safeParse(result.organization_id).success) {
          throw new TypeError(
            `Failed to load associated organization IDs for user '${uid}', received bad value from database query!`,
          );
        }
        return result.organization_id
      });

      const org_ids: Set<OrganizationID> = new Set(
        all_organization_ids
      );
      const unique_org_ids: SetIterator<OrganizationID> = org_ids.values();

      organization_ids = [...unique_org_ids];
    } catch (e: unknown) {
      console.error(
        `Failed to load associated organization IDs for user '${uid}': `,
        e,
      );
      throw new Error(
        `Failed to load associated organization IDs for user '${uid}'!`,
      );
    }

    if (!Array.isArray(organization_ids) || !organization_ids.every((org) => typeof org === "string" && organizationIdSchema.safeParse(org).success)) {
      throw new TypeError(
        `Failed to load associated organization IDs for user '${uid}', received bad value from organizations registry!`,
      );
    }

    if (this.debug) {
      console.log(
        `[OrganizationsRegistry] listUserOrganizationMemberships(uid = '${uid}') -> ${JSON.stringify(organization_ids)}`
      );
    }

    return organization_ids;
  }

  public async listOrganizationMembers(
    org_id: OrganizationID,
  ): Promise<readonly OrganizationMemberWithUserData[]> {
    if (!(await this.hasBeenInitialized())) {
      await this.performSetupTasks();
    }

    const parsed_org_id = await organizationIdSchema.safeParseAsync(org_id);
    if (!parsed_org_id.success) {
      throw new Error(
        "OrganizationsRegistry.listOrganizationMembers() received invalid organization ID!",
      );
    }
    const organization_id: OrganizationID = parsed_org_id.data;

    if (this.debug) {
      console.log(
        `[OrganizationsRegistry] listOrganizationMembers(org_id = '${org_id}')`,
      );
    }

    try {
      const membersQuery = this.db
        .selectFrom("organization_membership_roles")
        .innerJoin("users", "organization_membership_roles.uid", "users.uid")
        .where("organization_membership_roles.organization_id", "=", organization_id)
        .select([
          "organization_membership_roles.membership_declaration_id",
          "organization_membership_roles.organization_id",
          "organization_membership_roles.uid",
          "organization_membership_roles.role",
          "organization_membership_roles.created_at as membership_created_at",
          "users.email",
          "users.email_verified",
          "users.admin",
          "users.disabled",
        ])
        .orderBy("organization_membership_roles.created_at", "desc");

      const rows = await membersQuery.execute();

      const members: OrganizationMemberWithUserData[] = rows.map((row) => ({
        membership_declaration_id: row.membership_declaration_id,
        organization_id: row.organization_id as OrganizationID,
        uid: row.uid,
        role: row.role as OrganizationMembershipRoleType,
        membership_created_at:
          typeof row.membership_created_at === "number"
            ? row.membership_created_at
            : Number.parseInt(row.membership_created_at as string),
        email: row.email,
        email_verified: row.email_verified ?? undefined,
        admin: row.admin ?? undefined,
        disabled: row.disabled ?? undefined,
      }));

      if (this.debug) {
        console.log(
          `[OrganizationsRegistry] listOrganizationMembers(org_id = '${org_id}') => ${members.length} members`,
        );
      }

      return members;
    } catch (e: unknown) {
      console.error(
        `Failed to list organization members for organization '${organization_id}': `,
        e,
      );
      throw new Error(
        `Failed to list organization members for organization '${organization_id}'!`,
      );
    }
  }

  public async addMembership(
    org_id: OrganizationID,
    uid: string,
    role: OrganizationMembershipRoleType,
  ): Promise<void> {
    if (!(await this.hasBeenInitialized())) {
      await this.performSetupTasks();
    }

    const parsed_org_id = await organizationIdSchema.safeParseAsync(org_id);
    if (!parsed_org_id.success) {
      throw new Error(
        "OrganizationsRegistry.addMembership() received invalid organization ID!",
      );
    }
    const organization_id: OrganizationID = parsed_org_id.data;

    if (!isValidUuid(uid)) {
      throw new Error(
        "OrganizationsRegistry.addMembership() received invalid user ID!",
      );
    }

    if (!isValidOrganizationMembershipRoleType(role)) {
      throw new Error(
        "OrganizationsRegistry.addMembership() received invalid organization membership role!",
      );
    }

    try {
      const roleInsertionQuery = this.db
        .insertInto("organization_membership_roles")
        .values({
          membership_declaration_id: crypto.randomUUID(),
          organization_id,
          uid,
          role,
          created_at: Date.now(),
        });

      await roleInsertionQuery.executeTakeFirstOrThrow();
    } catch (e: unknown) {
      console.error(
        `Failed to add new user membership role '${role}' for user '${uid}' to organization '${organization_id}': `,
        e,
      );
      throw new Error(
        `Failed to add new user membership role '${role}' for user '${uid}' to organization '${organization_id}'!`,
      );
    }
  }
}
