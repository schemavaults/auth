import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import {
  type IProtectedAuthenticatedApiRouteProps,
  withAuthenticatedApiRouteGuard,
} from "@/lib/withAuthenticatedRouteGuard";
import {
  OrganizationsRegistry,
  lookupInvitation,
  respondToInvitation,
  revokeInvitation,
  type InvitationResponseAction,
  MAXIMUM_USER_ORGANIZATIONS,
  RespondToInvitationResult,
  hasUserExceededMaximumOrgMemberships,
} from "@/lib/auth-db/organizations";
import {
  type OrganizationID,
  organizationIdSchema,
} from "@schemavaults/auth-common";
import { z } from "zod";
import type { ServerRuntime } from "next";

export const runtime: ServerRuntime = "edge";
export const dynamic = "force-dynamic";

class ExceededMembershipLimitError extends Error {}

const respondToInvitationSchema = z.object({
  action: z.enum(["accept", "decline"]),
});

async function PATCH_respond_to_invitation_handler(
  { user, dbh }: IProtectedAuthenticatedApiRouteProps,
  context: RouteContext<"/api/organizations/[organization_id]/invitations/[invitation_id]">,
  req: NextRequest
): Promise<NextResponse> {
  const { organization_id: org_id_param, invitation_id } = await context.params;

  const parsed_org_id = await organizationIdSchema.safeParseAsync(org_id_param);
  if (!parsed_org_id.success) {
    return NextResponse.json(
      {
        success: false,
        message: "Invalid organization ID provided!",
      },
      { status: 400 }
    );
  }
  const organization_id: OrganizationID = parsed_org_id.data;

  // Validate invitation_id is a UUID
  if (!z.string().uuid().safeParse(invitation_id).success) {
    return NextResponse.json(
      {
        success: false,
        message: "Invalid invitation ID provided!",
      },
      { status: 400 }
    );
  }

  // Parse request body
  let action: InvitationResponseAction;
  try {
    const body = await req.json();
    const parsed = respondToInvitationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid request body. Expected { action: 'accept' | 'decline' }",
        },
        { status: 400 }
      );
    }
    action = parsed.data.action;
  } catch {
    return NextResponse.json(
      {
        success: false,
        message: "Failed to parse request body",
      },
      { status: 400 }
    );
  }

  // Look up the invitation first to verify it belongs to this organization
  const invitation = await lookupInvitation(dbh.db, invitation_id);
  if (!invitation) {
    return NextResponse.json(
      {
        success: false,
        message: "Invitation not found",
      },
      { status: 404 }
    );
  }

  if (invitation.organization_id !== organization_id) {
    return NextResponse.json(
      {
        success: false,
        message: "Invitation does not belong to this organization",
      },
      { status: 404 }
    );
  }

  // Only the invitee can respond to the invitation
  if (invitation.invitee_uid !== user.uid) {
    return NextResponse.json(
      {
        success: false,
        message: "You are not authorized to respond to this invitation",
      },
      { status: 403 }
    );
  }

  let result: RespondToInvitationResult;
  try {
    result = await dbh.db.transaction().execute(async (trx): Promise<RespondToInvitationResult> => {
      // Check if user has reached the maximum number of organization memberships when accepting
      if (action === "accept") {
        const exceededMembershipLimit = await hasUserExceededMaximumOrgMemberships(trx, user.uid);
        if (exceededMembershipLimit) {
          throw new ExceededMembershipLimitError();
        }
      }

      return await respondToInvitation(trx, invitation_id, user.uid, action)
    })

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          message: result.message,
        },
        { status: 400 }
      );
    }


  } catch (e: unknown) {
    console.error("Failed to respond to invitation:", e);
    if (e instanceof ExceededMembershipLimitError) {
      return NextResponse.json(
        {
          success: false,
          message: `You have reached the maximum number of organization memberships (${MAXIMUM_USER_ORGANIZATIONS}). Please leave an organization before accepting this invitation.`,
        },
        { status: 409 }
      );
    }
    return NextResponse.json(
      {
        success: false,
        message: "Failed to respond to invitation",
      },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      success: true,
      message: result.message,
      data: {
        invitation: result.invitation,
      },
    },
    { status: 200 }
  );
}

async function DELETE_revoke_invitation_handler(
  { user, dbh }: IProtectedAuthenticatedApiRouteProps,
  context: RouteContext<"/api/organizations/[organization_id]/invitations/[invitation_id]">
): Promise<NextResponse> {
  const { organization_id: org_id_param, invitation_id } = await context.params;

  const parsed_org_id = await organizationIdSchema.safeParseAsync(org_id_param);
  if (!parsed_org_id.success) {
    return NextResponse.json(
      {
        success: false,
        message: "Invalid organization ID provided!",
      },
      { status: 400 }
    );
  }
  const organization_id: OrganizationID = parsed_org_id.data;

  // Validate invitation_id is a UUID
  if (!z.string().uuid().safeParse(invitation_id).success) {
    return NextResponse.json(
      {
        success: false,
        message: "Invalid invitation ID provided!",
      },
      { status: 400 }
    );
  }

  const registry = new OrganizationsRegistry(dbh.db);

  // Check access: user must be admin OR owner of the organization
  const userMemberships = await registry.listUserOrganizationMemberships(user.uid, user.admin ?? false);
  const userMembership = userMemberships.find(m => m.organization_id === organization_id);

  if (!user.admin && (!userMembership || userMembership.role !== "owner")) {
    return NextResponse.json(
      {
        success: false,
        message: "Only organization owners can revoke invitations",
      },
      { status: 403 }
    );
  }

  // Look up the invitation first to verify it belongs to this organization
  const invitation = await lookupInvitation(dbh.db, invitation_id);
  if (!invitation) {
    return NextResponse.json(
      {
        success: false,
        message: "Invitation not found",
      },
      { status: 404 }
    );
  }

  if (invitation.organization_id !== organization_id) {
    return NextResponse.json(
      {
        success: false,
        message: "Invitation does not belong to this organization",
      },
      { status: 404 }
    );
  }

  try {
    const result = await revokeInvitation(dbh.db, invitation_id, user.uid);

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          message: result.message,
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: result.message,
        data: {
          invitation: result.invitation,
        },
      },
      { status: 200 }
    );
  } catch (e: unknown) {
    console.error("Failed to revoke invitation:", e);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to revoke invitation",
      },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest, context: RouteContext<'/api/organizations/[organization_id]/invitations/[invitation_id]'>): Promise<NextResponse> {
  return (await withAuthenticatedApiRouteGuard(
    (props) => PATCH_respond_to_invitation_handler(props, context, req)
  ))(req);
}

export async function DELETE(req: NextRequest, context: RouteContext<'/api/organizations/[organization_id]/invitations/[invitation_id]'>): Promise<NextResponse> {
  return (await withAuthenticatedApiRouteGuard(
    (props) => DELETE_revoke_invitation_handler(props, context)
  ))(req);
}
