import { z } from "zod";
import { organizationIdSchema } from "./organization_id";
import { organizationMembershipRoleTypeSchema } from "./organization-membership-role-type";
import type { OrganizationMembershipRoleType } from "./organization-membership-role-type";

/**
 * A single organization membership, as returned by
 * `GET /api/me/organizations`. Carries enough info to display a button
 * linking to the org plus the user's role badge.
 */
export interface OrganizationMembershipRole {
  organization_id: string;
  organization_name: string;
  role: OrganizationMembershipRoleType;
  created_at: number;
}

export const organizationMembershipRoleSchema: z.ZodType<OrganizationMembershipRole> =
  z.object({
    organization_id: organizationIdSchema,
    organization_name: z.string().min(1),
    role: organizationMembershipRoleTypeSchema as z.ZodType<OrganizationMembershipRoleType>,
    created_at: z.number().int().nonnegative(),
  });

export function isValidOrganizationMembershipRole(
  value: unknown,
): value is OrganizationMembershipRole {
  return organizationMembershipRoleSchema.safeParse(value).success;
}
