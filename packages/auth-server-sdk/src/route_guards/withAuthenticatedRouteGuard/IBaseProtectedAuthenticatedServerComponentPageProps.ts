import type { SchemaVaultsAppEnvironment } from "@schemavaults/app-definitions";
import type { UserData } from "@schemavaults/auth-common";

export interface IBaseProtectedAuthenticatedServerComponentPageProps {
  user: UserData;
  environment: SchemaVaultsAppEnvironment;
}
