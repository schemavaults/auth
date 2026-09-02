import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import type { IProtectedAuthenticatedApiRouteProps } from "@/lib/withAuthenticatedRouteGuard";
import {
  OrganizationsRegistry,
  addOrganizationMembership,
  hasUserExceededMaximumOrgMemberships,
  listOrganizationInvitations,
  type OrganizationMemberWithUserData,
} from "@/lib/auth-db/organizations";
import { getUserByUID } from "@/lib/auth-db/users";
import {
  type OrganizationID,
  organizationIdSchema,
  addExistingMemberRoles,
  getHardcodedOrgs,
  MAXIMUM_USER_ORGANIZATIONS,
} from "@schemavaults/auth-common";
import { z } from "zod";
import captureServerException from "@/lib/captureServerException";

const ROUTE = "/api/organizations/[organization_id]/members";

// Request body for directly adding an existing user (organization_id comes
// from the URL). Unlike the invitation flow, no invitee acceptance is
// required, so this surface is restricted to global administrators.
const addMemberRequestSchema = z
  .object({
    uid: z.string().uuid(),
    role: z.enum(addExistingMemberRoles),
  })
  .strict();

class ExceededMembershipLimitError extends Error {}

export async function POST_add_member_handler(
  { user, dbh }: IProtectedAuthenticatedApiRouteProps,
  context: RouteContext<"/api/organizations/[organization_id]/members">,
  req: NextRequest,
): Promise<NextResponse> {
  const { organization_id: org_id_param } = await context.params;

  const parsed_org_id = await organizationIdSchema.safeParseAsync(org_id_param);
  if (!parsed_org_id.success) {
    return NextResponse.json(
      {
        success: false,
        message: "Invalid organization ID provided!",
      },
      { status: 400 },
    );
  }
  const organization_id: OrganizationID = parsed_org_id.data;

  // Only global administrators may bypass the invitation flow and add a
  // user directly. Organization owners must use invitations instead.
  if (!user.admin) {
    return NextResponse.json(
      {
        success: false,
        message: "Only administrators can add existing users to an organization directly!",
      },
      { status: 403 },
    );
  }

  let target_uid: string;
  let role: (typeof addExistingMemberRoles)[number];
  try {
    const body: unknown = await req.json();
    const parsed = await addMemberRequestSchema.safeParseAsync(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid request body",
          errors: parsed.error.flatten(),
        },
        { status: 400 },
      );
    }
    target_uid = parsed.data.uid;
    role = parsed.data.role;
  } catch {
    return NextResponse.json(
      {
        success: false,
        message: "Failed to parse request body",
      },
      { status: 400 },
    );
  }

  // Memberships in hardcoded/system organizations are virtual (derived from
  // the admin flag) and cannot be declared in the database.
  const isHardcoded = getHardcodedOrgs().some(
    (org) => org.organization_id === organization_id,
  );
  if (isHardcoded) {
    return NextResponse.json(
      {
        success: false,
        message: "Cannot add members to a system organization!",
      },
      { status: 403 },
    );
  }

  const registry = new OrganizationsRegistry(dbh.db);

  try {
    await registry.lookupOrganization(organization_id);
  } catch {
    return NextResponse.json(
      {
        success: false,
        message: "Organization not found!",
      },
      { status: 404 },
    );
  }

  let target_email: string;
  try {
    const targetUser = await getUserByUID(dbh.db, target_uid);
    if (!targetUser) {
      return NextResponse.json(
        {
          success: false,
          message: "No user found with that ID",
        },
        { status: 404 },
      );
    }
    target_email = targetUser.email;
  } catch (e: unknown) {
    await captureServerException(dbh.db, e, {
      op_name: "POST_add_member_handler.getUserByUID",
      route: ROUTE,
      uid: user.uid,
      context: { organization_id, target_uid },
    });
    return NextResponse.json(
      {
        success: false,
        message: "Failed to lookup user",
      },
      { status: 500 },
    );
  }

  const targetMemberships = await registry.listUserOrganizationMembershipIds(target_uid, false);
  if (targetMemberships.includes(organization_id)) {
    return NextResponse.json(
      {
        success: false,
        message: "User is already a member of this organization",
      },
      { status: 409 },
    );
  }

  try {
    await dbh.db.transaction().execute(async (trx): Promise<void> => {
      const exceededMembershipLimit = await hasUserExceededMaximumOrgMemberships(trx, target_uid);
      if (exceededMembershipLimit) {
        throw new ExceededMembershipLimitError();
      }

      await addOrganizationMembership(trx, organization_id, target_uid, role);

      // A directly-added member no longer needs any outstanding invitation;
      // revoke it so it does not linger in the sent/pending invitation lists.
      const pendingInvitations = await listOrganizationInvitations(trx, organization_id, { status: "pending" });
      const now = Date.now();
      for (const invitation of pendingInvitations) {
        if (invitation.invitee_uid !== target_uid) continue;
        await trx
          .updateTable("organization_invitations")
          .set({ status: "revoked", responded_at: now })
          .where("invitation_id", "=", invitation.invitation_id)
          .execute();
      }
    });
  } catch (e: unknown) {
    if (e instanceof ExceededMembershipLimitError) {
      return NextResponse.json(
        {
          success: false,
          message: `This user has reached the maximum number of organization memberships (${MAXIMUM_USER_ORGANIZATIONS}).`,
        },
        { status: 409 },
      );
    }
    await captureServerException(dbh.db, e, {
      op_name: "POST_add_member_handler.addOrganizationMembership",
      route: ROUTE,
      uid: user.uid,
      context: { organization_id, target_uid, role },
    });
    return NextResponse.json(
      {
        success: false,
        message: "Failed to add member to organization!",
      },
      { status: 500 },
    );
  }

  let member: OrganizationMemberWithUserData | undefined;
  try {
    const members = await registry.listOrganizationMembers(organization_id);
    member = members.find((m) => m.uid === target_uid);
  } catch (e: unknown) {
    await captureServerException(dbh.db, e, {
      op_name: "POST_add_member_handler.listOrganizationMembers",
      route: ROUTE,
      uid: user.uid,
      context: { organization_id, target_uid, nonFatal: true },
    });
  }

  return NextResponse.json(
    {
      success: true,
      message: `Successfully added ${target_email} to the organization as ${role}!`,
      data: {
        member: member ?? { organization_id, uid: target_uid, role, email: target_email },
      },
    },
    { status: 201 },
  );
}

export default POST_add_member_handler;
