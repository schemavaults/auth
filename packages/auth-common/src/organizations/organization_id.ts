import { z } from "zod";
import {
  MAXIMUM_ORGANIZATION_ID_LENGTH,
  MINIMUM_ORGANIZATION_ID_LENGTH,
} from "./organization_constants";

export const organizationIdSchema = z
  .string()
  .min(
    MINIMUM_ORGANIZATION_ID_LENGTH,
    `Organization ID must be at least ${MINIMUM_ORGANIZATION_ID_LENGTH} characters long.`,
  )
  .max(
    MAXIMUM_ORGANIZATION_ID_LENGTH,
    `Organization ID may not be longer than ${MAXIMUM_ORGANIZATION_ID_LENGTH} characters long.`,
  )
  .regex(
    /^[a-z][a-z0-9_-]+$/,
    "Organization ID must start with a letter, and may only contain lowercase alphanumeric characters, numbers, hyphens and underscores.",
  )
  .refine((orgId: string): boolean => {
    if (orgId.endsWith("_") || orgId.endsWith("-")) {
      return false;
    }
    return true;
  }, "Organization ID may not end with a hyphen or dash.");

export type OrganizationID = z.infer<typeof organizationIdSchema>;

export function isValidOrganizationID(
  organization_id: string,
): organization_id is OrganizationID {
  return organizationIdSchema.safeParse(organization_id).success;
}
