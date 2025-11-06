import type {
  OrganizationDefinition,
  OrganizationID,
} from "@schemavaults/auth-common";
import type { OrganizationMembershipRoleType } from "./organization-membership-role-types";

export interface IOrganizationsRegistry {
  lookupOrganization: (
    org_id: OrganizationID,
  ) => Promise<OrganizationDefinition>;

  createOrganization: (org: OrganizationDefinition) => Promise<void>;

  listUserOrganizationMemberships: (
    uid: string,
  ) => Promise<readonly OrganizationID[]>;

  addMembership: (
    org_id: OrganizationID,
    uid: string,
    role: OrganizationMembershipRoleType,
  ) => Promise<void>;

  setup: () => Promise<void>;
}
