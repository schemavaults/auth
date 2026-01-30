import type { Kysely, Transaction } from "@schemavaults/dbh";
import type { AuthDatabase } from "../auth-database-types";
import type { OrganizationID } from "@schemavaults/auth-common";
import type { OrganizationInvitationDefinition, OrganizationInvitationStatus } from "./organization-invitation-definition";

export interface OrganizationInvitationWithUserData extends OrganizationInvitationDefinition {
  invitee_email: string;
  inviter_email: string;
}

export interface ListOrganizationInvitationsOptions {
  status?: OrganizationInvitationStatus;
}

export async function listOrganizationInvitations(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
  organization_id: OrganizationID,
  options: ListOrganizationInvitationsOptions = {},
  debug: boolean = false
): Promise<readonly OrganizationInvitationWithUserData[]> {
  if (debug) {
    console.log(
      `[listOrganizationInvitations] Listing invitations for org=${organization_id}, status=${options.status ?? "all"}`
    );
  }

  try {
    let query = db
      .selectFrom("organization_invitations")
      .innerJoin("users as invitee", "organization_invitations.invitee_uid", "invitee.uid")
      .innerJoin("users as inviter", "organization_invitations.inviter_uid", "inviter.uid")
      .where("organization_invitations.organization_id", "=", organization_id)
      .select([
        "organization_invitations.invitation_id",
        "organization_invitations.organization_id",
        "organization_invitations.inviter_uid",
        "organization_invitations.invitee_uid",
        "organization_invitations.status",
        "organization_invitations.created_at",
        "organization_invitations.expires_at",
        "organization_invitations.responded_at",
        "invitee.email as invitee_email",
        "inviter.email as inviter_email",
      ])
      .orderBy("organization_invitations.created_at", "desc");

    if (options.status) {
      query = query.where("organization_invitations.status", "=", options.status);
    }

    const rows = await query.execute();

    const invitations: OrganizationInvitationWithUserData[] = rows.map((row) => ({
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
      invitee_email: row.invitee_email,
      inviter_email: row.inviter_email,
    }));

    if (debug) {
      console.log(
        `[listOrganizationInvitations] Found ${invitations.length} invitations for org=${organization_id}`
      );
    }

    return invitations;
  } catch (e: unknown) {
    console.error("[listOrganizationInvitations] Failed to list invitations:", e);
    throw new Error("Failed to list organization invitations");
  }
}

export default listOrganizationInvitations;
