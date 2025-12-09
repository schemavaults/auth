import type { Insertable, Selectable, Updateable } from "@schemavaults/dbh";
import type { OrganizationMembershipRoleDefinition } from "./organization-membership-role-definition";

export type OrganizationMembershipRolesTable =
  OrganizationMembershipRoleDefinition;

export type OrganizationMembershipRoleRow =
  Selectable<OrganizationMembershipRolesTable>;
export type NewOOrganizationMembershipRoleRow =
  Insertable<OrganizationMembershipRolesTable>;
export type OrganizationMembershipRoleRowUpdate =
  Updateable<OrganizationMembershipRolesTable>;
