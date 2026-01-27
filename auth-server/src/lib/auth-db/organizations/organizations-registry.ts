import type { Kysely } from "@schemavaults/dbh";
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
import type { OrganizationMemberWithUserData } from "./organization-member-with-user-data";
import type { OrganizationMembershipRoleDefinition } from "./organization-membership-role-definition";

export class OrganizationsRegistry
  implements IOrganizationsRegistry
{
  private readonly hardcodedOrganizations: Map<string, OrganizationDefinition> = new Map(hardcodedOrgs.map(hardcodedOrg => [hardcodedOrg.organization_id, hardcodedOrg]))

  private readonly env: SchemaVaultsAppEnvironment;
  private readonly debug: boolean;


  public constructor(
    protected readonly db: Kysely<AuthDatabase>,
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

    function isReservedId() {
      if (organization_definition.organization_id === SCHEMAVAULTS_ORGANIZATION_ID) {
        return true;
      }

      if (hardcodedOrgs.some(
        (hardcodedOrganization): boolean => (
          hardcodedOrganization.organization_id === organization_definition.organization_id
        )
      )) {
        return true;
      }

      return false;
    }

    if (isReservedId()) {
      throw new Error(
        `'${organization_definition.organization_id}' is a reserved organization ID!`,
      );
    }

    if (this.debug) {
      console.log(
        `[OrganizationsRegistry] createOrganization(${JSON.stringify(organization_definition)})`,
      );
    }

    if (!organization_definition.created_by) {
      throw new TypeError("Missing 'created_by' field for new organization!")
    }

    const insertionQuery = this.db
      .insertInto("organizations")
      .values(organization_definition);

    await insertionQuery.executeTakeFirstOrThrow();
  }

  public async listAllOrganizations(): Promise<readonly OrganizationDefinition[]> {

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
    admin: boolean = false
  ): Promise<readonly OrganizationMembershipRoleDefinition[]> {
    const debug: boolean = this.debug;

    if (!isValidUuid(uid)) {
      throw new Error(
        "Invalid user ID to lookup organization memberships for!",
      );
    }

    if (debug) {
      console.log(
        `[OrganizationsRegistry] listUserOrganizationMemberships(uid = '${uid}')`,
      );
    }

    const db = this.db;
    async function listMembershipsForUserFromDatabase(): Promise<readonly OrganizationMembershipRoleDefinition[]> {
      const membershipsQuery = db
        .selectFrom("organization_membership_roles")
        .where("uid", "=", uid)
        .selectAll();

      const memberships = await membershipsQuery.execute();
      if (memberships.length === 0) {
        if (debug) {
          console.log(
            `[OrganizationsRegistry] listMembershipsForUserFromDatabase(uid = '${uid}') -> []`,
          );
        }
        return [];
      }
      const all_memberships: OrganizationMembershipRoleDefinition[] = memberships.map((row) => {
        if (!organizationIdSchema.safeParse(row.organization_id).success) {
          throw new TypeError(
            `Failed to load associated organization IDs for user '${uid}', received bad value from database query!`,
          );
        }
        return {
          membership_declaration_id: row.membership_declaration_id,
          organization_id: row.organization_id as OrganizationID,
          uid: row.uid,
          created_at: typeof row.created_at === "number"
            ? row.created_at
            : Number.parseInt(row.created_at as string),
          role: row.role as OrganizationMembershipRoleType,
        };
      });
      return all_memberships;
    }

    // Initialize list of memberships to store.
    // First load from hardcoded set, then load from db.
    const memberships: OrganizationMembershipRoleDefinition[] = []

    const hardcodedOrganizations = this.hardcodedOrganizations;
    // Add virtual membership for admin users in the schemavaults organization
    if (admin) {
      const hardcodedOrg = hardcodedOrganizations.get(SCHEMAVAULTS_ORGANIZATION_ID);
      if (!hardcodedOrg) {
        throw new Error("Expected there to be a hardcoded organization with ID: \"" + SCHEMAVAULTS_ORGANIZATION_ID + "\"")
      }
      memberships.push({
        membership_declaration_id: `admin-virtual-${uid}`,
        organization_id: SCHEMAVAULTS_ORGANIZATION_ID,
        uid,
        created_at: hardcodedOrg.created_at,
        role: "admin",
      });
    }

    try {
      // Memberships that are recorded in the database
      const all_memberships_from_db: readonly OrganizationMembershipRoleDefinition[] = await listMembershipsForUserFromDatabase();

      if (!Array.isArray(all_memberships_from_db)) {
        throw new TypeError("Loaded bad memberships from database")
      }

      if (all_memberships_from_db.some((membership): boolean => {
        return this.hardcodedOrganizations.has(membership.organization_id)
      })) {
        throw new Error("One of the organization IDs from the database conflicts with a hardcoded organization ID!")
      }

      memberships.push(...all_memberships_from_db);
    } catch (e: unknown) {
      console.error(
        `Failed to load associated organization memberships for user '${uid}': `,
        e,
      );
      throw new Error(
        `Failed to load associated organization memberships for user '${uid}'!`,
      );
    }

    if (this.debug) {
      console.log(
        `[OrganizationsRegistry] listUserOrganizationMemberships(uid = '${uid}') -> ${memberships.length} memberships`
      );
    }

    return memberships;
  }

  public async listUserOrganizationMembershipIds(
    uid: string,
    admin: boolean = false
  ): Promise<readonly OrganizationID[]> {
    const memberships = await this.listUserOrganizationMemberships(uid, admin);
    return memberships.map((membership) => membership.organization_id);
  }

  public async listOrganizationMembers(
    org_id: OrganizationID,
  ): Promise<readonly OrganizationMemberWithUserData[]> {

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

      // Add virtual memberships for admin users in the schemavaults organization
      if (organization_id === SCHEMAVAULTS_ORGANIZATION_ID) {
        const adminUsersQuery = this.db
          .selectFrom("users")
          .where("admin", "=", true)
          .selectAll();

        const adminUsers = await adminUsersQuery.execute();

        // Get set of uids already in explicit memberships
        const existingMemberUids = new Set(members.map(m => m.uid));

        // Get the hardcoded org creation date for virtual memberships
        const hardcodedOrg = this.hardcodedOrganizations.get(SCHEMAVAULTS_ORGANIZATION_ID);
        const virtualMembershipCreatedAt = hardcodedOrg?.created_at ?? Date.now();

        // Add virtual memberships for admin users not already in list
        for (const adminUser of adminUsers) {
          if (!existingMemberUids.has(adminUser.uid)) {
            members.push({
              membership_declaration_id: `admin-virtual-${adminUser.uid}`,
              organization_id: SCHEMAVAULTS_ORGANIZATION_ID,
              uid: adminUser.uid,
              role: "admin" as OrganizationMembershipRoleType,
              membership_created_at: virtualMembershipCreatedAt,
              email: adminUser.email,
              email_verified: adminUser.email_verified ?? undefined,
              admin: adminUser.admin ?? undefined,
              disabled: adminUser.disabled ?? undefined,
            });
          }
        }
      }

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

export default OrganizationsRegistry;
