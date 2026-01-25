import { z } from "zod";
import { type OrganizationID, organizationIdSchema } from "./organization_id";

export const inviteMemberInputModes = ["email", "uid"] as const;
export type InviteMemberInputMode = (typeof inviteMemberInputModes)[number];

export const inviteMemberFormSchema = z
  .object({
    organization_id: organizationIdSchema,
    input_mode: z.enum(inviteMemberInputModes),
    identifier: z.union([z.string().uuid(), z.string().email()]),
  })
  .required({
    organization_id: true,
    input_mode: true,
    identifier: true,
  })
  .strict()
  .superRefine((data, ctx: z.RefinementCtx) => {
    if (data.input_mode === "uid") {
      if (!z.string().uuid().safeParse(data.identifier).success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Must be a valid UUID",
          path: ["identifier"],
        });
      }
    } else if (data.input_mode === "email") {
      if (!z.string().email().safeParse(data.identifier).success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Must be a valid email address",
          path: ["identifier"],
        });
      }
    }
  });

export type InviteMemberFormValues = z.infer<typeof inviteMemberFormSchema>;

export interface InviteMemberSubmitData {
  organization_id: OrganizationID;
  input_mode: InviteMemberInputMode;
  uid?: string;
  email?: string;
}
