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
  hardcodedOrgs,
  MAXIMUM_USER_ORGANIZATIONS,
} from "@schemavaults/auth-common";
import type { OrganizationRow } from "./organizations-table";
import isValidUuid from "@/lib/is-valid-uuid";
import {
  isValidOrganizationMembershipRoleType,
  type OrganizationMembershipRoleType,
} from "./organization-membership-role-types";
import type { OrganizationMemberWithUserData } from "./organization-member-with-user-data";
import type { OrganizationMembershipRoleDefinition } from "./organization-membership-role-definition";
import createOrganization from "./create-organization";
import addOrganizationMembership from "./add-organization-membership";
import countUserRealMemberships from "./count-user-real-memberships";
import { hasUserExceededMaximumOrgMemberships } from "./has-user-exceeded-maximum-org-memberships";
import { listAllOrganizations } from './list-all-organizations';
import { listUserOrganizationMemberships } from './list-user-organization-memberships';

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

  public async createOrganization(org: OrganizationDefinition): Promise<void> {
    return await createOrganization(this.db, org, this.debug);
  }

  public async listAllOrganizations(): Promise<readonly OrganizationDefinition[]> {
    return await listAllOrganizations(this.db, this.debug);
  }

  public async listUserOrganizationMemberships(
    uid: string,
    admin: boolean = false
  ): Promise<readonly OrganizationMembershipRoleDefinition[]> {
    return await listUserOrganizationMemberships(this.db, uid, admin, this.debug)
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
    return await addOrganizationMembership(this.db, org_id, uid, role);
  }

  public async updateMemberRole(
    org_id: OrganizationID,
    uid: string,
    new_role: OrganizationMembershipRoleType,
  ): Promise<void> {
    const parsed_org_id = await organizationIdSchema.safeParseAsync(org_id);
    if (!parsed_org_id.success) {
      throw new Error(
        "OrganizationsRegistry.updateMemberRole() received invalid organization ID!",
      );
    }
    const organization_id: OrganizationID = parsed_org_id.data;

    if (!isValidUuid(uid)) {
      throw new Error(
        "OrganizationsRegistry.updateMemberRole() received invalid user ID!",
      );
    }

    if (!isValidOrganizationMembershipRoleType(new_role)) {
      throw new Error(
        "OrganizationsRegistry.updateMemberRole() received invalid organization membership role!",
      );
    }

    // Cannot update roles in hardcoded organizations (like schemavaults)
    if (this.hardcodedOrganizations.has(organization_id)) {
      throw new Error(
        "Cannot update member roles in hardcoded organizations!",
      );
    }

    // Prevent demoting the last owner
    if (new_role !== "owner") {
      const currentMembers = await this.listOrganizationMembers(organization_id);
      const ownerCount = currentMembers.filter(m => m.role === "owner").length;
      const isCurrentlyOwner = currentMembers.some(m => m.uid === uid && m.role === "owner");

      if (isCurrentlyOwner && ownerCount <= 1) {
        throw new Error(
          "Cannot demote the last owner of an organization!",
        );
      }
    }

    if (this.debug) {
      console.log(
        `[OrganizationsRegistry] updateMemberRole(org_id = '${org_id}', uid = '${uid}', new_role = '${new_role}')`,
      );
    }

    try {
      const updateQuery = this.db
        .updateTable("organization_membership_roles")
        .set({ role: new_role })
        .where("organization_id", "=", organization_id)
        .where("uid", "=", uid);

      const result = await updateQuery.executeTakeFirst();

      if (!result || result.numUpdatedRows === BigInt(0)) {
        throw new Error(
          `No membership found for user '${uid}' in organization '${organization_id}'`,
        );
      }
    } catch (e: unknown) {
      console.error(
        `Failed to update user membership role to '${new_role}' for user '${uid}' in organization '${organization_id}': `,
        e,
      );
      throw new Error(
        `Failed to update user membership role to '${new_role}' for user '${uid}' in organization '${organization_id}'!`,
      );
    }
  }

  public async countUserRealMemberships(uid: string): Promise<number> {
    return await countUserRealMemberships(this.db, uid, this.debug);
  }

  public static readonly MAXIMUM_USER_ORGANIZATIONS = MAXIMUM_USER_ORGANIZATIONS;

  public get MAXIMUM_USER_ORGANIZATIONS(): number {
    return OrganizationsRegistry.MAXIMUM_USER_ORGANIZATIONS;
  }

  /**
   * @param uid The user ID to count # memberships for and compare to the maximum.
   * @returns A promise resolving to true if they have reached or exceeded 'MAXIMUM_USER_ORGANIZATIONS'
   * @see OrganizationsRegistry.MAXIMUM_USER_ORGANIZATIONS
   */
  public async hasUserExceededMaximumOrgMemberships(uid: string): Promise<boolean> {
    return await hasUserExceededMaximumOrgMemberships(this.db, uid, this.MAXIMUM_USER_ORGANIZATIONS);
  }

  public async deleteOrganization(
    org_id: OrganizationID,
  ): Promise<DeleteOrganizationResult> {
    const parsed_org_id = await organizationIdSchema.safeParseAsync(org_id);
    if (!parsed_org_id.success) {
      return {
        success: false,
        message: "Invalid organization ID provided!",
      };
    }
    const organization_id: OrganizationID = parsed_org_id.data;

    // Block deletion of hardcoded organizations
    if (this.hardcodedOrganizations.has(organization_id)) {
      return {
        success: false,
        message: "Cannot delete a hardcoded organization!",
      };
    }

    if (this.debug) {
      console.log(
        `[OrganizationsRegistry] deleteOrganization(org_id = '${org_id}')`,
      );
    }

    try {
      const deleteQuery = this.db
        .deleteFrom("organizations")
        .where("organization_id", "=", organization_id);

      const result = await deleteQuery.executeTakeFirst();

      if (!result || result.numDeletedRows === BigInt(0)) {
        return {
          success: false,
          message: "Organization not found",
        };
      }

      if (this.debug) {
        console.log(
          `[OrganizationsRegistry] deleteOrganization(org_id = '${org_id}') => success`,
        );
      }

      return {
        success: true,
        message: "Organization deleted successfully",
      };
    } catch (e: unknown) {
      console.error(
        `Failed to delete organization '${organization_id}': `,
        e,
      );
      return {
        success: false,
        message: "Failed to delete organization",
      };
    }
  }
}

export type DeleteOrganizationResult =
  | { success: true; message: string }
  | { success: false; message: string };

export default OrganizationsRegistry;
