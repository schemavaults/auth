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
  /**
   * Path (or absolute URL) of the app's same-origin auth session route,
   * e.g. "/auth/session" (see `getSessionRouteUrl()` on the SDK adapter).
   */
  session_route_uri?: string;
  fetch: (url: string, init: RequestInit | undefined) => Promise<Response>;
}
