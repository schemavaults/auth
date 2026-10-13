import type {
  AppId,
  SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import type { AuthSessionRoutes } from "@schemavaults/auth-client-sdk";

export interface IReactAuthClientSdkAdapterInitOptions {
  uuid?: () => string;
  environment: SchemaVaultsAppEnvironment;
  auth_server_uri?: string;
  debug?: boolean;
  client_app_id: AppId;
  /** The auth server deployment's own app id; defaults to "schemavaults-auth" */
  auth_server_app_id?: AppId;
  /**
   * The app's same-origin auth session routes, each by its own path (or
   * absolute URL); see `getSessionRouteUrls()` on the SDK adapter.
   */
  session_routes?: AuthSessionRoutes;
  fetch: (url: string, init: RequestInit | undefined) => Promise<Response>;
}
