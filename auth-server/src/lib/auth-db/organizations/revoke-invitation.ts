import type { Kysely, Transaction } from "@schemavaults/dbh";
import type { AuthDatabase } from "../auth-database-types";
import type { OrganizationInvitationDefinition } from "./organization-invitation-definition";
import { lookupInvitation } from "./lookup-invitation";

export interface RevokeInvitationResult {
  success: boolean;
  message: string;
  invitation?: OrganizationInvitationDefinition;
}

export async function revokeInvitation(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
  invitation_id: string,
  revoker_uid: string,
  debug: boolean = false
): Promise<RevokeInvitationResult> {
  if (debug) {
    console.log(
      `[revokeInvitation] User ${revoker_uid} revoking invitation ${invitation_id}`
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

  // Check if invitation is still pending
  if (invitation.status !== "pending") {
    return {
      success: false,
      message: `Cannot revoke invitation with status: ${invitation.status}`,
    };
  }

  const now = Date.now();

  try {
    // Update invitation status to revoked
    await db
      .updateTable("organization_invitations")
      .set({ status: "revoked", responded_at: now })
      .where("invitation_id", "=", invitation_id)
      .execute();

    const updatedInvitation: OrganizationInvitationDefinition = {
      ...invitation,
      status: "revoked",
      responded_at: now,
    };

    if (debug) {
      console.log(
        `[revokeInvitation] Successfully revoked invitation ${invitation_id}`
      );
    }

    return {
      success: true,
      message: "Invitation revoked successfully",
      invitation: updatedInvitation,
    };
  } catch (e: unknown) {
    console.error("[revokeInvitation] Failed to revoke invitation:", e);
    throw new Error("Failed to revoke invitation");
  }
}

export default revokeInvitation;
