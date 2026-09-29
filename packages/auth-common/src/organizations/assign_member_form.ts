import { z } from "zod";
import { type OrganizationID, organizationIdSchema } from "./organization_id";
import {
  inviteMemberInputModes,
  type InviteMemberInputMode,
} from "./invite_member_form";

/**
 * Roles a platform administrator may assign directly. `admin` is the
 * virtual role administrators hold in the owner organization and is never
 * stored.
 */
export const assignableOrganizationMembershipRoles = [
  "member",
  "owner",
] as const;
export type AssignableOrganizationMembershipRole =
  (typeof assignableOrganizationMembershipRoles)[number];

export const assignableOrganizationMembershipRoleSchema = z.enum(
  assignableOrganizationMembershipRoles,
);

/**
 * The "assign a member" form of platform administrators: adds a user to an
 * organization directly, without an invitation. The user is named like in
 * the invite form (`input_mode` + `identifier`).
 */
export const assignMemberFormSchema = z
  .object({
    organization_id: organizationIdSchema,
    input_mode: z.enum(inviteMemberInputModes),
    identifier: z.string().trim().min(1, "Required"),
    role: assignableOrganizationMembershipRoleSchema,
  })
  .strict()
  .superRefine((data, ctx: z.RefinementCtx) => {
    if (data.input_mode === "uid") {
      if (!z.guid().safeParse(data.identifier).success) {
        ctx.addIssue({
          code: "custom",
          message: "Must be a valid UUID",
          path: ["identifier"],
        });
      }
    } else if (data.input_mode === "email") {
      if (!z.email().safeParse(data.identifier).success) {
        ctx.addIssue({
          code: "custom",
          message: "Must be a valid email address",
          path: ["identifier"],
        });
      }
    }
  });

export type AssignMemberFormValues = z.infer<typeof assignMemberFormSchema>;

export interface AssignMemberSubmitData {
  organization_id: OrganizationID;
  input_mode: InviteMemberInputMode;
  /** E-mail address (`input_mode: email`) or user id (`input_mode: uid`). */
  identifier: string;
  role: AssignableOrganizationMembershipRole;
}
