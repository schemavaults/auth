import type { Kysely, Transaction } from "@schemavaults/dbh";
import type { AuthDatabase } from "../auth-database-types";
import type { OrganizationInvitationDefinition, OrganizationInvitationStatus } from "./organization-invitation-definition";
import { lookupInvitation } from "./lookup-invitation";

export type InvitationResponseAction = "accept" | "decline";

export interface RespondToInvitationResult {
  success: boolean;
  message: string;
  invitation?: OrganizationInvitationDefinition;
}

export async function respondToInvitation(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
  invitation_id: string,
  invitee_uid: string,
  action: InvitationResponseAction,
  debug: boolean = false
): Promise<RespondToInvitationResult> {
  if (debug) {
    console.log(
      `[respondToInvitation] User ${invitee_uid} responding to invitation ${invitation_id} with action: ${action}`
    );
  }

  // Look up the invitation
  const invitation = await lookupInvitation(db, invitation_id, debug);

  if (!invitation) {
    return {
      success: false,
      message: "Invitation not found",
    };
  }

  // Verify the invitee is the one responding
  if (invitation.invitee_uid !== invitee_uid) {
    return {
      success: false,
      message: "You are not authorized to respond to this invitation",
    };
  }

  // Check if invitation is still pending
  if (invitation.status !== "pending") {
    return {
      success: false,
      message: `Cannot respond to invitation with status: ${invitation.status}`,
    };
  }

  // Check if invitation has expired
  const now = Date.now();
  if (invitation.expires_at <= now) {
    // Update status to expired
    await db
      .updateTable("organization_invitations")
      .set({ status: "expired", responded_at: now })
      .where("invitation_id", "=", invitation_id)
      .execute();

    return {
      success: false,
      message: "Invitation has expired",
    };
  }

  const newStatus: OrganizationInvitationStatus = action === "accept" ? "accepted" : "declined";

  try {
    // Update invitation status
    await db
      .updateTable("organization_invitations")
      .set({ status: newStatus, responded_at: now })
      .where("invitation_id", "=", invitation_id)
      .execute();

    // If accepting, create the membership
    if (action === "accept") {
      const membership_declaration_id = crypto.randomUUID();
      await db
        .insertInto("organization_membership_roles")
        .values({
          membership_declaration_id,
          organization_id: invitation.organization_id,
          uid: invitee_uid,
          role: "member",
          created_at: now,
        })
        .executeTakeFirstOrThrow();

      if (debug) {
        console.log(
          `[respondToInvitation] Created membership for user ${invitee_uid} in org ${invitation.organization_id}`
        );
      }
    }

    const updatedInvitation: OrganizationInvitationDefinition = {
      ...invitation,
      status: newStatus,
      responded_at: now,
    };

    if (debug) {
      console.log(
        `[respondToInvitation] Successfully ${action}ed invitation ${invitation_id}`
      );
    }

    return {
      success: true,
      message: action === "accept"
        ? "Successfully joined the organization"
        : "Invitation declined",
      invitation: updatedInvitation,
    };
  } catch (e: unknown) {
    console.error("[respondToInvitation] Failed to respond to invitation:", e);
    throw new Error("Failed to respond to invitation");
  }
}

export default respondToInvitation;
