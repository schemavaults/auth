import { sql, type Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "../auth-database-types";
import {
  getAppEnvironment,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import type { IOrganizationsRegistry } from "./IOrganizationsRegistry";
import {
  OrganizationDefinition,
  organizationDefinitionSchema,
  OrganizationID,
  organizationIdSchema,
  SCHEMAVAULTS_ORGANIZATION_ID,
} from "@schemavaults/auth";
import { OrganizationRow } from "./organizations-table";
import isValidUuid from "@/lib/is-valid-uuid";
import {
  isValidOrganizationMembershipRoleType,
  OrganizationMembershipRoleType,
} from "./organization-membership-role-types";

export class OrganizationsRegistry implements IOrganizationsRegistry {
  private readonly env: SchemaVaultsAppEnvironment;
  private readonly debug: boolean;
  private readonly db: Kysely<AuthDatabase>;

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

  public async setup(): Promise<void> {
    await OrganizationsRegistry.setup(this.db);
  }

  public constructor(
    db: Kysely<AuthDatabase>,
    debug: boolean | undefined = undefined,
  ) {
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

    const lookupOrgQuery = this.db
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

    if (this.debug) {
      console.log(
        `[OrganizationsRegistry] lookupOrganization(org_id = '${org_id}') => `,
        output,
      );
    }

    return output;
  }

  public async createOrganization(
    org_def: OrganizationDefinition,
  ): Promise<void> {
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

  public async listUserOrganizationMemberships(
    uid: string,
  ): Promise<readonly OrganizationID[]> {
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
      const orgs: Set<OrganizationID> = new Set(
        ...memberships.map((result) => result.organization_id),
      );
      const unique_org_ids: SetIterator<OrganizationID> = orgs.values();

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

    return organization_ids;
  }

  public async addMembership(
    org_id: OrganizationID,
    uid: string,
    role: OrganizationMembershipRoleType,
  ): Promise<void> {
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
