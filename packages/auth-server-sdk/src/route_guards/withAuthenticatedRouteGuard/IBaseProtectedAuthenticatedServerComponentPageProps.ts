import type { SchemaVaultsAppEnvironment } from "@schemavaults/app-definitions";
import type {
  OrganizationID,
  OrganizationMembershipRoleType,
} from "@schemavaults/auth-common/organizations";
import type { UserData } from "@schemavaults/auth-common";

export interface IBaseProtectedAuthenticatedServerComponentPageProps {
  user: UserData;
  environment: SchemaVaultsAppEnvironment;
  isUserInOrganization: (
    user: UserData,
    org_id: OrganizationID,
  ) => Promise<OrganizationMembershipRoleType | false>;
}
