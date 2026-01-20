import type { SchemaVaultsAppEnvironment } from "@schemavaults/app-definitions";
import type { OrganizationID, UserData } from "@schemavaults/auth-common";

export interface InitRouteGuardCheckOptions {
  user: UserData | null;
  user_organizations: readonly OrganizationID[] | null;
  environment: SchemaVaultsAppEnvironment;
}
