import { z } from "zod";
import { type OrganizationID, organizationIdSchema } from "./organization_id";

/**
 * Roles a global administrator may assign when directly adding an existing
 * user to an organization. The virtual `admin` role is reserved for the
 * owner organization and is never assignable through this form.
 */
export const addExistingMemberRoles = ["member", "owner"] as const;
export type AddExistingMemberRole = (typeof addExistingMemberRoles)[number];

export const addExistingMemberFormSchema = z
  .object({
    organization_id: organizationIdSchema,
    uid: z.string().uuid("Select a user to add"),
    role: z.enum(addExistingMemberRoles),
  })
  .required({
    organization_id: true,
    uid: true,
    role: true,
  })
  .strict();

export type AddExistingMemberFormValues = z.infer<
  typeof addExistingMemberFormSchema
>;

export interface AddExistingMemberSubmitData {
  organization_id: OrganizationID;
  uid: string;
  role: AddExistingMemberRole;
}
