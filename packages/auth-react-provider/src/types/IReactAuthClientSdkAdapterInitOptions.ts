import type { SchemaVaultsAppEnvironment } from "@schemavaults/app-definitions";

export interface IReactAuthClientSdkAdapterInitOptions {
  uuid?: () => string;
  environment: SchemaVaultsAppEnvironment;
  debug?: boolean;
}
