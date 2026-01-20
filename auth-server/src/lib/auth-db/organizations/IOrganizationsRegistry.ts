import type {
  OrganizationDefinition,
  OrganizationID,
} from "@schemavaults/auth-common";
import type { OrganizationMembershipRoleType } from "./organization-membership-role-types";
import type { OrganizationMemberWithUserData } from "./organization-member-with-user-data";

export interface IOrganizationsRegistry {
  lookupOrganization: (
    org_id: OrganizationID,
  ) => Promise<OrganizationDefinition>;

  createOrganization: (org: OrganizationDefinition) => Promise<void>;

  listAllOrganizations: () => Promise<readonly OrganizationDefinition[]>;

  listUserOrganizationMemberships: (
    uid: string,
  ) => Promise<readonly OrganizationID[]>;

  listOrganizationMembers: (
    org_id: OrganizationID,
  ) => Promise<readonly OrganizationMemberWithUserData[]>;

  addMembership: (
    org_id: OrganizationID,
    uid: string,
    role: OrganizationMembershipRoleType,
  ) => Promise<void>;
}
