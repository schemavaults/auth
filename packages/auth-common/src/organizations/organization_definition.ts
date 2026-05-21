import { z } from "zod";
import { organizationIdSchema } from "./organization_id";
import { organizationNameSchema } from "./organization_name";

export const organizationDefinitionSchema = z
  .object({
    organization_id: organizationIdSchema,
    name: organizationNameSchema,
    created_at: z.number().positive(),
    created_by: z.string().uuid().optional().nullable(),
  })
  .required({
    organization_id: true,
    name: true,
    created_at: true,
  })
  .strict();

export type OrganizationDefinition = z.infer<
  typeof organizationDefinitionSchema
>;
