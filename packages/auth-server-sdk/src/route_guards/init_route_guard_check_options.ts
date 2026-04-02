import type { SchemaVaultsAppEnvironment } from "@schemavaults/app-definitions";
import type { UserData } from "@schemavaults/auth-common";

export interface InitRouteGuardCheckOptions {
  user: UserData | null;
  environment: SchemaVaultsAppEnvironment;
}
