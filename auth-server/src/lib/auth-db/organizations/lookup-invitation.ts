import type { Kysely, Transaction } from "@schemavaults/dbh";
import type { AuthDatabase } from "../auth-database-types";
import type { OrganizationID } from "@schemavaults/auth-common";
import type { OrganizationInvitationDefinition, OrganizationInvitationStatus } from "./organization-invitation-definition";

export async function lookupInvitation(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
  invitation_id: string,
  debug: boolean = false
): Promise<OrganizationInvitationDefinition | null> {
  if (debug) {
    console.log(`[lookupInvitation] Looking up invitation: ${invitation_id}`);
  }

  try {
    const row = await db
      .selectFrom("organization_invitations")
      .where("invitation_id", "=", invitation_id)
      .selectAll()
      .executeTakeFirst();

    if (!row) {
      if (debug) {
        console.log(`[lookupInvitation] Invitation not found: ${invitation_id}`);
      }
      return null;
    }

    const invitation: OrganizationInvitationDefinition = {
      invitation_id: row.invitation_id,
      organization_id: row.organization_id as OrganizationID,
      inviter_uid: row.inviter_uid,
      invitee_uid: row.invitee_uid,
      status: row.status as OrganizationInvitationStatus,
      created_at:
        typeof row.created_at === "number"
          ? row.created_at
          : Number.parseInt(row.created_at as string),
      expires_at:
        typeof row.expires_at === "number"
          ? row.expires_at
          : Number.parseInt(row.expires_at as string),
      responded_at: row.responded_at
        ? typeof row.responded_at === "number"
          ? row.responded_at
          : Number.parseInt(row.responded_at as string)
        : null,
    };

    if (debug) {
      console.log(`[lookupInvitation] Found invitation:`, invitation);
    }

    return invitation;
  } catch (e: unknown) {
    console.error("[lookupInvitation] Failed to lookup invitation:", e);
    throw new Error("Failed to lookup invitation");
  }
}

export default lookupInvitation;
