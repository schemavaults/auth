import { z } from "zod";

export const organizationMembershipRoleTypes = [
  "owner",
  "admin",  // For virtual admin memberships in the schemavaults org
] as const satisfies readonly string[];

export type OrganizationMembershipRoleType =
  (typeof organizationMembershipRoleTypes)[number];

export const organizationMembershipRoleTypeSchema = z.string().refine(
  (
    maybeValidRole: string,
  ): maybeValidRole is OrganizationMembershipRoleType => {
    const validRoles: readonly string[] = organizationMembershipRoleTypes;
    if (validRoles.includes(maybeValidRole)) {
      return true;
    }
    return false;
  },
  `Invalid organization membership role! Should be one of: ${organizationMembershipRoleTypes.map((s) => `'${s}'`).join(", ")}`,
);

export function isValidOrganizationMembershipRoleType(
  role: string,
): role is OrganizationMembershipRoleType {
  return organizationMembershipRoleTypeSchema.safeParse(role).success;
}
