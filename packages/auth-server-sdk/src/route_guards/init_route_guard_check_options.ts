import type { SchemaVaultsAppEnvironment } from "@schemavaults/app-definitions";
import type { UserData } from "@schemavaults/auth";

export interface InitRouteGuardCheckOptions {
  user: UserData | null;
  environment: SchemaVaultsAppEnvironment;
}
