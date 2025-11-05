import { z } from "zod";
import { organizationIdSchema } from "./organization_id";
import {
  MAXIMUM_ORGANIZATION_NAME_LENGTH,
  MINIMUM_ORGANIZATION_NAME_LENGTH,
} from "./organization_constants";

const organizationNameSchema = z
  .string()
  .min(
    MINIMUM_ORGANIZATION_NAME_LENGTH,
    `Organization name must be at least ${MINIMUM_ORGANIZATION_NAME_LENGTH} character${MINIMUM_ORGANIZATION_NAME_LENGTH >= 2 ? "s" : ""} long.`,
  )
  .max(
    MAXIMUM_ORGANIZATION_NAME_LENGTH,
    `Organization name may not be longer than ${MAXIMUM_ORGANIZATION_NAME_LENGTH} characters long.`,
  );

export const organizationDefinitionSchema = z
  .object({
    organization_id: organizationIdSchema,
    name: organizationNameSchema,
    created_at: z.number().positive(),
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
