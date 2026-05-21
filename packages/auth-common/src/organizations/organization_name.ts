import { z } from "zod";
import {
  MAXIMUM_ORGANIZATION_NAME_LENGTH,
  MINIMUM_ORGANIZATION_NAME_LENGTH,
} from "./organization_constants";

export const organizationNameSchema = z
  .string()
  .min(
    MINIMUM_ORGANIZATION_NAME_LENGTH,
    `Organization name must be at least ${MINIMUM_ORGANIZATION_NAME_LENGTH} character${MINIMUM_ORGANIZATION_NAME_LENGTH >= 2 ? "s" : ""} long.`,
  )
  .max(
    MAXIMUM_ORGANIZATION_NAME_LENGTH,
    `Organization name may not be longer than ${MAXIMUM_ORGANIZATION_NAME_LENGTH} characters long.`,
  )
  .regex(
    /^[a-zA-Z0-9]([a-zA-Z0-9 _-]*[a-zA-Z0-9])?$/,
    "Organization name may only contain alphanumeric characters, spaces, hyphens, and underscores, and must start and end with an alphanumeric character.",
  );

export type OrganizationName = z.infer<typeof organizationNameSchema>;

export function isValidOrganizationName(
  organization_name: string,
): organization_name is OrganizationName {
  return organizationNameSchema.safeParse(organization_name).success;
}
