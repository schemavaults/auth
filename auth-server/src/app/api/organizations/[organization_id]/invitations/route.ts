import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import {
  type IProtectedAuthenticatedApiRouteProps,
  withAuthenticatedApiRouteGuard,
} from "@/lib/withAuthenticatedRouteGuard";
import {
  OrganizationsRegistry,
  createOrganizationInvitation,
  listOrganizationInvitations,
} from "@/lib/auth-db/organizations";
import { getUserByEmail, getUserByUID } from "@/lib/auth-db/users";
import { sendTeamInvitationEmail } from "@/lib/send-team-invitation-emails";
import {
  type OrganizationID,
  organizationIdSchema,
  inviteMemberInputModes,
} from "@schemavaults/auth-common";
import type { ServerRuntime } from "next";
import { z } from "zod";

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ organization_id: string }>;
}

// Schema for invitation request body (organization_id comes from URL)
const createInvitationRequestSchema = z.object({
  input_mode: z.enum(inviteMemberInputModes),
  identifier: z.string().min(1),
}).refine((data) => {
  if (data.input_mode === "uid") {
    return z.string().uuid().safeParse(data.identifier).success;
  } else if (data.input_mode === "email") {
    return z.string().email().safeParse(data.identifier).success;
  }
  return false;
}, {
  message: "Invalid identifier format for the selected input mode",
  path: ["identifier"],
});

async function POST_create_invitation_handler(
  { user, dbh }: IProtectedAuthenticatedApiRouteProps,
  context: RouteContext,
  req: NextRequest
): Promise<NextResponse> {
  const { organization_id: org_id_param } = await context.params;

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

  // Parse request body
  let input_mode: "email" | "uid";
  let identifier: string;
  try {
    const body = await req.json();
    const parsed = await createInvitationRequestSchema.safeParseAsync(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid request body",
          errors: parsed.error.flatten(),
        },
        { status: 400 }
      );
    }
    input_mode = parsed.data.input_mode;
    identifier = parsed.data.identifier;
  } catch {
    return NextResponse.json(
      {
        success: false,
        message: "Failed to parse request body",
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
        message: "Only organization owners can invite members",
      },
      { status: 403 }
    );
  }

  // Look up the invitee
  let invitee_uid: string;
  try {
    if (input_mode === "email") {
      const invitee = await getUserByEmail(dbh.db, identifier);
      if (!invitee) {
        return NextResponse.json(
          {
            success: false,
            message: "No user found with that email address",
          },
          { status: 404 }
        );
      }
      invitee_uid = invitee.uid;
    } else {
      const invitee = await getUserByUID(dbh.db, identifier);
      if (!invitee) {
        return NextResponse.json(
          {
            success: false,
            message: "No user found with that ID",
          },
          { status: 404 }
        );
      }
      invitee_uid = invitee.uid;
    }
  } catch (e: unknown) {
    console.error("Failed to lookup invitee:", e);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to lookup user",
      },
      { status: 500 }
    );
  }

  // Check if user is already a member
  const inviteeMemberships = await registry.listUserOrganizationMembershipIds(invitee_uid, false);
  if (inviteeMemberships.includes(organization_id)) {
    return NextResponse.json(
      {
        success: false,
        message: "User is already a member of this organization",
      },
      { status: 409 }
    );
  }

  // Check if there's already a pending invitation
  const existingInvitations = await listOrganizationInvitations(dbh.db, organization_id, { status: "pending" });
  const existingInvitation = existingInvitations.find(inv => inv.invitee_uid === invitee_uid);
  if (existingInvitation) {
    return NextResponse.json(
      {
        success: false,
        message: "There is already a pending invitation for this user",
      },
      { status: 409 }
    );
  }

  // Create the invitation
  try {
    const invitation = await createOrganizationInvitation(dbh.db, {
      organization_id,
      inviter_uid: user.uid,
      invitee_uid,
    });

    try {
      await sendTeamInvitationEmail({
        db: dbh.db,
        organization_id,
        inviter_uid: user.uid,
        invitee_uid,
      });
    } catch (emailError: unknown) {
      console.error(
        `[POST /organizations/${organization_id}/invitations] Failed to send team-invitation email:`,
        emailError,
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: "Invitation created successfully",
        data: {
          invitation,
        },
      },
      { status: 201 }
    );
  } catch (e: unknown) {
    console.error("Failed to create invitation:", e);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to create invitation",
      },
      { status: 500 }
    );
  }
}

async function GET_list_invitations_handler(
  { user, dbh }: IProtectedAuthenticatedApiRouteProps,
  context: RouteContext
): Promise<NextResponse> {
  const { organization_id: org_id_param } = await context.params;

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

  const registry = new OrganizationsRegistry(dbh.db);

  // Check access: user must be admin OR owner of the organization
  const userMemberships = await registry.listUserOrganizationMemberships(user.uid, user.admin ?? false);
  const userMembership = userMemberships.find(m => m.organization_id === organization_id);

  if (!user.admin && (!userMembership || userMembership.role !== "owner")) {
    return NextResponse.json(
      {
        success: false,
        message: "Only organization owners can view invitations",
      },
      { status: 403 }
    );
  }

  try {
    const invitations = await listOrganizationInvitations(dbh.db, organization_id);

    return NextResponse.json(
      {
        success: true,
        message: "Successfully listed organization invitations",
        data: {
          invitations,
        },
      },
      { status: 200 }
    );
  } catch (e: unknown) {
    console.error("Failed to list invitations:", e);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to list invitations",
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  return (await withAuthenticatedApiRouteGuard(
    (props) => POST_create_invitation_handler(props, context, req)
  ))(req);
}

export async function GET(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  return (await withAuthenticatedApiRouteGuard(
    (props) => GET_list_invitations_handler(props, context)
  ))(req);
}
