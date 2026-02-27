import type { SchemaVaultsAppEnvironment } from "@schemavaults/app-definitions";
import type { OrganizationID, UserData } from "@schemavaults/auth-common";
import type { CustomJWTPayload } from "@schemavaults/jwt";

export interface InitRouteGuardCheckOptions {
  user: UserData | null;
  jwt_payload: CustomJWTPayload | null;
  user_organizations: readonly OrganizationID[] | null;
  environment: SchemaVaultsAppEnvironment;
}
