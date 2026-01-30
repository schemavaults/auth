import type { Kysely, Transaction } from "@schemavaults/dbh";
import type { AuthDatabase } from "../auth-database-types";
import type { OrganizationID } from "@schemavaults/auth-common";
import type { OrganizationInvitationStatus } from "./organization-invitation-definition";

export interface UserPendingInvitation {
  invitation_id: string;
  organization_id: OrganizationID;
  organization_name: string;
  inviter_uid: string;
  inviter_email: string;
  status: OrganizationInvitationStatus;
  created_at: number;
  expires_at: number;
}

export async function listUserPendingInvitations(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
  uid: string,
  debug: boolean = false
): Promise<readonly UserPendingInvitation[]> {
  if (debug) {
    console.log(`[listUserPendingInvitations] Listing pending invitations for user=${uid}`);
  }

  const now = Date.now();

  try {
    const rows = await db
      .selectFrom("organization_invitations")
      .innerJoin("organizations", "organization_invitations.organization_id", "organizations.organization_id")
      .innerJoin("users as inviter", "organization_invitations.inviter_uid", "inviter.uid")
      .where("organization_invitations.invitee_uid", "=", uid)
      .where("organization_invitations.status", "=", "pending")
      .where("organization_invitations.expires_at", ">", now)
      .select([
        "organization_invitations.invitation_id",
        "organization_invitations.organization_id",
        "organizations.name as organization_name",
        "organization_invitations.inviter_uid",
        "inviter.email as inviter_email",
        "organization_invitations.status",
        "organization_invitations.created_at",
        "organization_invitations.expires_at",
      ])
      .orderBy("organization_invitations.created_at", "desc")
      .execute();

    const invitations: UserPendingInvitation[] = rows.map((row) => ({
      invitation_id: row.invitation_id,
      organization_id: row.organization_id as OrganizationID,
      organization_name: row.organization_name,
      inviter_uid: row.inviter_uid,
      inviter_email: row.inviter_email,
      status: row.status as OrganizationInvitationStatus,
      created_at:
        typeof row.created_at === "number"
          ? row.created_at
          : Number.parseInt(row.created_at as string),
      expires_at:
        typeof row.expires_at === "number"
          ? row.expires_at
          : Number.parseInt(row.expires_at as string),
    }));

    if (debug) {
      console.log(
        `[listUserPendingInvitations] Found ${invitations.length} pending invitations for user=${uid}`
      );
    }

    return invitations;
  } catch (e: unknown) {
    console.error("[listUserPendingInvitations] Failed to list invitations:", e);
    throw new Error("Failed to list user pending invitations");
  }
}

export default listUserPendingInvitations;
