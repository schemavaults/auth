import type { SchemaVaultsAppEnvironment } from "@schemavaults/app-definitions";
import type { OrganizationID, UserData } from "@schemavaults/auth-common";

export interface IBaseProtectedAuthenticatedServerComponentPageProps {
  user: UserData;
  user_organizations: readonly OrganizationID[];
  environment: SchemaVaultsAppEnvironment;
}
