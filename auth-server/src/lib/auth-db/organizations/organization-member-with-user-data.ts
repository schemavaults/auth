import type { OrganizationID, OrganizationMembershipRoleType } from "@schemavaults/auth-common/organizations";

export type OrganizationMemberWithUserData = {
  membership_declaration_id: string;
  organization_id: OrganizationID;
  uid: string;
  role: OrganizationMembershipRoleType;
  membership_created_at: number;
  email: string;
  email_verified?: boolean;
  admin?: boolean;
  disabled?: boolean;
};
