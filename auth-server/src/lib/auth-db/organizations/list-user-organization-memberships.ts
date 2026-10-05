import "server-only";
import isValidUuid from "@/lib/is-valid-uuid";
import type { OrganizationMembershipRoleDefinition } from "./organization-membership-role-definition";
import type { Kysely, Transaction } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import { getHardcodedOrgs, type OrganizationDefinition, type OrganizationID, organizationIdSchema } from "@schemavaults/auth-common";
import type { OrganizationMembershipRoleType } from "@schemavaults/auth-common/organizations";
import { getAuthServerOwnerOrganizationId } from "@/lib/config/auth-server-owner-organization";
import {
  getServiceAccountVirtualOrganizationMembership,
  type ServiceAccountVirtualOrganizationMembership,
} from "@/lib/auth-db/apps/app-registry/app-service-account-organization-roles";

/**
 * `membership_declaration_id` prefixes of the memberships that have no
 * ORGANIZATION_MEMBERSHIP_ROLES row: platform admins' membership of the
 * owner organization (derived from the admin flag) and a service
 * account's membership of the organization that owns its app (opted into
 * by the app's managers, migration 00043).
 */
export const ADMIN_VIRTUAL_MEMBERSHIP_ID_PREFIX = "admin-virtual-";
export const SERVICE_ACCOUNT_VIRTUAL_MEMBERSHIP_ID_PREFIX =
  "service-account-virtual-";

export type VirtualOrganizationMembershipSource = "admin" | "service_account";

/** Why a listed membership exists without a membership row, or null for a real one. */
export function getVirtualOrganizationMembershipSource(
  membership_declaration_id: string,
): VirtualOrganizationMembershipSource | null {
  if (membership_declaration_id.startsWith(ADMIN_VIRTUAL_MEMBERSHIP_ID_PREFIX)) {
    return "admin";
  }
  if (membership_declaration_id.startsWith(SERVICE_ACCOUNT_VIRTUAL_MEMBERSHIP_ID_PREFIX)) {
    return "service_account";
  }
  return null;
}

export async function listUserOrganizationMemberships(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
  uid: string,
  admin: boolean = false,
  debug: boolean = false
): Promise<readonly OrganizationMembershipRoleDefinition[]> {
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
        organization_id: row.organization_id satisfies OrganizationID,
        uid: row.uid,
        created_at: typeof row.created_at === "number"
          ? row.created_at
          : Number.parseInt(row.created_at as string),
        role: row.role satisfies OrganizationMembershipRoleType,
      };
    });
    return all_memberships;
  }

  const ownerOrganizationId: OrganizationID = getAuthServerOwnerOrganizationId();
  const hardcodedOrganizations = new Map<OrganizationID, OrganizationDefinition>(
    getHardcodedOrgs().map(hardcodedOrg => [hardcodedOrg.organization_id, hardcodedOrg])
  );

  // Initialize list of memberships to store.
  // First load from hardcoded set, then load from db.
  const memberships: OrganizationMembershipRoleDefinition[] = []

  // Add virtual membership for admin users in the owner organization
  if (admin) {
    const hardcodedOrg = hardcodedOrganizations.get(ownerOrganizationId);
    if (!hardcodedOrg) {
      throw new Error("Expected there to be a hardcoded organization with ID: \"" + ownerOrganizationId + "\"")
    }
    memberships.push({
      membership_declaration_id: `${ADMIN_VIRTUAL_MEMBERSHIP_ID_PREFIX}${uid}`,
      organization_id: ownerOrganizationId,
      uid,
      created_at: hardcodedOrg.created_at,
      role: "admin",
    });
  }

  try {
    // Memberships that are recorded in the database, and the virtual
    // membership of a service account whose app's managers opted it into
    // the organization that owns the app (null for every human account).
    const [all_memberships_from_db, service_account_membership]: [
      readonly OrganizationMembershipRoleDefinition[],
      ServiceAccountVirtualOrganizationMembership | null,
    ] = await Promise.all([
      listMembershipsForUserFromDatabase(),
      getServiceAccountVirtualOrganizationMembership(db, uid),
    ]);

    if (!Array.isArray(all_memberships_from_db)) {
      throw new TypeError("Loaded bad memberships from database")
    }

    if (all_memberships_from_db.some((membership): boolean => {
      return hardcodedOrganizations.has(membership.organization_id)
    })) {
      throw new Error("One of the organization IDs from the database conflicts with a hardcoded organization ID!")
    }

    memberships.push(...all_memberships_from_db);

    // Service accounts are refused membership rows (they cannot accept
    // invitations or be assigned directly) and a hardcoded organization
    // never owns an app, so this should never duplicate a membership
    // listed above; a real membership wins if it ever would.
    if (
      service_account_membership &&
      !hardcodedOrganizations.has(service_account_membership.organization_id) &&
      !memberships.some((m) => m.organization_id === service_account_membership.organization_id)
    ) {
      memberships.push({
        membership_declaration_id: `${SERVICE_ACCOUNT_VIRTUAL_MEMBERSHIP_ID_PREFIX}${service_account_membership.app_id}`,
        organization_id: service_account_membership.organization_id,
        uid,
        created_at: service_account_membership.created_at,
        role: service_account_membership.role,
      });
    }
  } catch (e: unknown) {
    console.error(
      `Failed to load associated organization memberships for user '${uid}': `,
      e,
    );
    throw new Error(
      `Failed to load associated organization memberships for user '${uid}'!`,
    );
  }

  if (debug) {
    console.log(
      `[OrganizationsRegistry] listUserOrganizationMemberships(uid = '${uid}') -> ${memberships.length} memberships`
    );
  }

  return memberships;
}

export default listUserOrganizationMemberships;
