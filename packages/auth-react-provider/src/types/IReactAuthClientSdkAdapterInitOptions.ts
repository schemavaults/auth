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
  /** The auth server deployment's own app id; defaults to "schemavaults-auth" */
  auth_server_app_id?: AppId;
  fetch: (url: string, init: RequestInit | undefined) => Promise<Response>;
}
