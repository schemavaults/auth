import type {
  AppId,
  SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";

export interface IReactAuthClientSdkAdapterInitOptions {
  uuid?: () => string;
  environment: SchemaVaultsAppEnvironment;
  auth_server_uri?: string;
  debug?: boolean;
  client_app_id: AppId;
}
