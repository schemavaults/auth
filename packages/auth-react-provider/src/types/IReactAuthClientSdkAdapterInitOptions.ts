import type { SchemaVaultsAppEnvironment } from "@schemavaults/app-definitions";

export interface IReactAuthClientSdkAdapterInitOptions {
  uuid?: () => string;
  environment: SchemaVaultsAppEnvironment;
  auth_server_uri?: string;
  debug?: boolean;
}
