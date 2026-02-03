import "server-only";

import { organizationIdSchema, type OrganizationID } from "@schemavaults/auth-common";
import { isValidOrganizationMembershipRoleType, type OrganizationMembershipRoleType } from "./organization-membership-role-types";
import isValidUuid from "@/lib/is-valid-uuid";
import type { Kysely, Transaction } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";

export async function addOrganizationMembership(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
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
    const roleInsertionQuery = db
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

export default addOrganizationMembership;
