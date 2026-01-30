import { z } from "zod";
import { type OrganizationID, organizationIdSchema } from "./organization_id";

export const organizationInvitationStatusTypes = [
  "pending",
  "accepted",
  "declined",
  "revoked",
  "expired",
] as const;

export type OrganizationInvitationStatus =
  (typeof organizationInvitationStatusTypes)[number];

export const organizationInvitationStatusSchema = z.enum(organizationInvitationStatusTypes);

/**
 * Organization invitation as returned by the API for display in the UI.
 * Includes display fields like organization_name and inviter_email.
 */
export interface OrganizationInvitation {
  invitation_id: string;
  organization_id: OrganizationID;
  organization_name?: string;
  inviter_uid: string;
  inviter_email?: string;
  invitee_uid: string;
  invitee_email?: string;
  status: OrganizationInvitationStatus;
  created_at: number;
  expires_at: number;
  responded_at?: number | null;
}

/**
 * Pending invitation for a user, with display fields for the account page.
 */
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

/**
 * Invitation with user data, for displaying in the organization's sent invitations list.
 */
export interface OrganizationInvitationWithUserData {
  invitation_id: string;
  organization_id: OrganizationID;
  inviter_uid: string;
  inviter_email: string;
  invitee_uid: string;
  invitee_email: string;
  status: OrganizationInvitationStatus;
  created_at: number;
  expires_at: number;
  responded_at?: number | null;
}

export const organizationInvitationSchema = z.object({
  invitation_id: z.string().uuid(),
  organization_id: organizationIdSchema,
  organization_name: z.string().optional(),
  inviter_uid: z.string().uuid(),
  inviter_email: z.string().email().optional(),
  invitee_uid: z.string().uuid(),
  invitee_email: z.string().email().optional(),
  status: organizationInvitationStatusSchema,
  created_at: z.number().positive(),
  expires_at: z.number().positive(),
  responded_at: z.number().positive().nullable().optional(),
});
