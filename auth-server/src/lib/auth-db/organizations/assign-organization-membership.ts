import "server-only";

import {
  MAXIMUM_USER_ORGANIZATIONS,
  type OrganizationID,
  type OrganizationMembershipRoleType,
} from "@schemavaults/auth-common";
import type { Transaction } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import type { OrganizationMembershipRoleDefinition } from "./organization-membership-role-definition";
import { addOrganizationMembership } from "./add-organization-membership";
import { hasUserExceededMaximumOrgMemberships } from "./has-user-exceeded-maximum-org-memberships";

/** The user already holds a membership row in the organization. */
export class AlreadyOrganizationMemberError extends Error {
  public constructor(public readonly role: OrganizationMembershipRoleType) {
    super(`User is already a member of this organization (role: '${role}')`);
    this.name = "AlreadyOrganizationMemberError";
  }
}

/** The user reached `MAXIMUM_USER_ORGANIZATIONS` memberships. */
export class OrganizationMembershipLimitReachedError extends Error {
  public constructor() {
    super(
      `User has reached the maximum number of organization memberships (${MAXIMUM_USER_ORGANIZATIONS})`,
    );
    this.name = "OrganizationMembershipLimitReachedError";
  }
}

/** The user row disappeared between the caller's lookup and the transaction. */
export class AssignedUserNotFoundError extends Error {
  public constructor() {
    super("No user found with that ID");
    this.name = "AssignedUserNotFoundError";
  }
}

export interface AssignOrganizationMembershipParams {
  organization_id: OrganizationID;
  uid: string;
  role: Exclude<OrganizationMembershipRoleType, "admin">;
}

export interface AssignOrganizationMembershipResult {
  membership: OrganizationMembershipRoleDefinition;
  /**
   * Pending invitations of the user to the organization, revoked because
   * the direct membership supersedes them.
   */
  revoked_invitation_ids: readonly string[];
}

/**
 * Makes a user a member of an organization directly, skipping the
 * invitation round trip (the platform administrators' "assign" flow).
 *
 * Runs inside the caller's transaction:
 * 1. locks the user's row, so concurrent assignments of the same user are
 *    serialized (the membership check and limit below stay accurate);
 * 2. revokes the user's pending invitations to the organization: accepting
 *    one later would add a second membership row. Revoking first takes the
 *    invitation row locks, so an acceptance racing this transaction either
 *    commits before (and the membership check below sees it) or finds the
 *    invitation no longer pending;
 * 3. refuses users that already hold a membership row in the organization
 *    or reached the membership limit;
 * 4. inserts the membership.
 *
 * Authorization, organization existence and system-organization checks are
 * the caller's.
 */
export async function assignOrganizationMembership(
  trx: Transaction<AuthDatabase>,
  { organization_id, uid, role }: AssignOrganizationMembershipParams,
): Promise<AssignOrganizationMembershipResult> {
  const lockedUser = await trx
    .selectFrom("users")
    .where("uid", "=", uid)
    .select("uid")
    .forUpdate()
    .executeTakeFirst();
  if (!lockedUser) {
    throw new AssignedUserNotFoundError();
  }

  const now: number = Date.now();
  const revokedInvitations = await trx
    .updateTable("organization_invitations")
    .set({ status: "revoked", responded_at: now })
    .where("organization_id", "=", organization_id)
    .where("invitee_uid", "=", uid)
    .where("status", "=", "pending")
    .returning("invitation_id")
    .execute();

  const existingMembership = await trx
    .selectFrom("organization_membership_roles")
    .where("organization_id", "=", organization_id)
    .where("uid", "=", uid)
    .select("role")
    .executeTakeFirst();
  if (existingMembership) {
    throw new AlreadyOrganizationMemberError(
      existingMembership.role as OrganizationMembershipRoleType,
    );
  }

  if (await hasUserExceededMaximumOrgMemberships(trx, uid)) {
    throw new OrganizationMembershipLimitReachedError();
  }

  const membership = await addOrganizationMembership(
    trx,
    organization_id,
    uid,
    role,
  );

  return {
    membership,
    revoked_invitation_ids: revokedInvitations.map((row) => row.invitation_id),
  };
}

export default assignOrganizationMembership;
