import type {
  OrganizationDefinition,
  OrganizationID,
} from "@schemavaults/auth-common";
import type { OrganizationMembershipRoleType } from "./organization-membership-role-types";
import type { OrganizationMemberWithUserData } from "./organization-member-with-user-data";
import type { OrganizationMembershipRoleDefinition } from "./organization-membership-role-definition";
import type { DeleteOrganizationResult } from "./organizations-registry";

export interface IOrganizationsRegistry {
  lookupOrganization: (
    org_id: OrganizationID,
  ) => Promise<OrganizationDefinition>;

  createOrganization: (org: OrganizationDefinition) => Promise<void>;

  listAllOrganizations: () => Promise<readonly OrganizationDefinition[]>;

  listUserOrganizationMemberships: (
    uid: string,
    admin?: boolean
  ) => Promise<readonly OrganizationMembershipRoleDefinition[]>;

  listUserOrganizationMembershipIds: (
    uid: string,
    admin?: boolean
  ) => Promise<readonly OrganizationID[]>;

  listOrganizationMembers: (
    org_id: OrganizationID,
  ) => Promise<readonly OrganizationMemberWithUserData[]>;

  addMembership: (
    org_id: OrganizationID,
    uid: string,
    role: OrganizationMembershipRoleType,
  ) => Promise<void>;

  updateMemberRole: (
    org_id: OrganizationID,
    uid: string,
    new_role: OrganizationMembershipRoleType,
  ) => Promise<void>;

  countUserRealMemberships: (uid: string) => Promise<number>;

  canUserJoinOrganization: (uid: string) => Promise<boolean>;

  deleteOrganization: (org_id: OrganizationID) => Promise<DeleteOrganizationResult>;
}
