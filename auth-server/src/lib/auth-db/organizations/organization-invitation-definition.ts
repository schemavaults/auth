import { organizationIdSchema } from "@schemavaults/auth-common";
import { z } from "zod";

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

export const organizationInvitationDefinitionSchema = z
  .object({
    invitation_id: z.string().uuid(),
    organization_id: organizationIdSchema,
    inviter_uid: z.string().uuid(),
    invitee_uid: z.string().uuid(),
    status: organizationInvitationStatusSchema,
    created_at: z.number().positive(),
    expires_at: z.number().positive(),
    responded_at: z.number().positive().nullable().optional(),
  })
  .required({
    invitation_id: true,
    organization_id: true,
    inviter_uid: true,
    invitee_uid: true,
    status: true,
    created_at: true,
    expires_at: true,
  })
  .strict();

export type OrganizationInvitationDefinition = z.infer<
  typeof organizationInvitationDefinitionSchema
>;
