import { organizationIdSchema } from "@schemavaults/auth-common";
import { z } from "zod";
import { organizationMembershipRoleTypeSchema } from "@schemavaults/auth-common/organizations";

export const organizationMembershipRoleDefinitionSchema = z
  .object({
    membership_declaration_id: z.string().uuid(),
    organization_id: organizationIdSchema,
    uid: z.string().uuid(),
    created_at: z.number().positive(),
    role: organizationMembershipRoleTypeSchema,
  })
  .required({
    membership_declaration_id: true,
    organization_id: true,
    uid: true,
    created_at: true,
    role: true,
  })
  .strict();

export type OrganizationMembershipRoleDefinition = z.infer<
  typeof organizationMembershipRoleDefinitionSchema
>;
