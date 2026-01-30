import type { Kysely, Transaction } from "@schemavaults/dbh";
import type { AuthDatabase } from "../auth-database-types";
import type { OrganizationID } from "@schemavaults/auth-common";
import type { OrganizationInvitationDefinition } from "./organization-invitation-definition";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export interface CreateOrganizationInvitationParams {
  organization_id: OrganizationID;
  inviter_uid: string;
  invitee_uid: string;
}

export async function createOrganizationInvitation(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
  params: CreateOrganizationInvitationParams,
  debug: boolean = false
): Promise<OrganizationInvitationDefinition> {
  const { organization_id, inviter_uid, invitee_uid } = params;

  if (debug) {
    console.log(
      `[createOrganizationInvitation] Creating invitation for org=${organization_id}, inviter=${inviter_uid}, invitee=${invitee_uid}`
    );
  }

  const now = Date.now();
  const invitation_id = crypto.randomUUID();
  const expires_at = now + SEVEN_DAYS_MS;

  const newInvitation: OrganizationInvitationDefinition = {
    invitation_id,
    organization_id,
    inviter_uid,
    invitee_uid,
    status: "pending",
    created_at: now,
    expires_at,
    responded_at: null,
  };

  try {
    await db
      .insertInto("organization_invitations")
      .values(newInvitation)
      .executeTakeFirstOrThrow();

    if (debug) {
      console.log(
        `[createOrganizationInvitation] Successfully created invitation: ${invitation_id}`
      );
    }

    return newInvitation;
  } catch (e: unknown) {
    console.error("[createOrganizationInvitation] Failed to create invitation:", e);
    throw new Error("Failed to create organization invitation");
  }
}

export default createOrganizationInvitation;
