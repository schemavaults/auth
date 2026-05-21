import { z } from "zod";
import { organizationIdSchema } from "./organization_id";
import { organizationNameSchema } from "./organization_name";
import { organizationMembershipRoleTypeSchema } from "./organization-membership-role-type";
import type { OrganizationMembershipRoleType } from "./organization-membership-role-type";

/**
 * A single organization-membership row, as returned by
 * `GET /api/me/organizations`. Carries enough info to display a button
 * linking to the org plus the user's role badge.
 *
 * `created_at` is the **organization's** creation timestamp (mirrors
 * `OrganizationDefinition.created_at`).
 * `joined_at` is the timestamp at which **this user** acquired their
 * current role in the organization (the underlying membership row's
 * `created_at` in the database).
 *
 * Distinct from `OrganizationMembershipRoleType` (the role enum) and from
 * the auth-server's internal `OrganizationMembershipRoleDefinition` (DB
 * row shape with `uid` + `membership_declaration_id`).
 */
export interface OrganizationMembershipRoleDetails {
  organization_id: string;
  organization_name: string;
  role: OrganizationMembershipRoleType;
  created_at: number;
  joined_at: number;
}

export const organizationMembershipRoleDetailsSchema = z
  .object({
    organization_id: organizationIdSchema,
    organization_name: organizationNameSchema,
    role: organizationMembershipRoleTypeSchema as z.ZodType<OrganizationMembershipRoleType>,
    created_at: z.number().int().nonnegative(),
    joined_at: z.number().int().nonnegative(),
  })
  .required({
    organization_id: true,
    organization_name: true,
    role: true,
    created_at: true,
    joined_at: true,
  })
  .strict();

export function isValidOrganizationMembershipRoleDetails(
  value: unknown,
): value is OrganizationMembershipRoleDetails {
  return organizationMembershipRoleDetailsSchema.safeParse(value).success;
}
