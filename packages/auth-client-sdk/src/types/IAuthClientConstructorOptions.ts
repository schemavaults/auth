import type { SchemaVaultsAppEnvironment } from "@schemavaults/app-definitions";
import type { ISchemaVaultsAuthClientAdapter } from "./ISchemaVaultsAuthClientAdapter";

export interface IAuthClientConstructorOptions {
  adapter: ISchemaVaultsAuthClientAdapter;

  // The URL of the auth server
  auth_server_url: string;

  // The URI to redirect to after successful authentication
  successful_authentication_redirect_uri: string;

  // The URI to redirect to after successful logout
  successful_logout_redirect_uri?: string;

  // The URI to redirect to with an authorization code in Oauth2 PKCE flow
  authorize_uri?: string;

  // The URI of the error page on this client (defaults to "/auth/error").
  // Used when the SDK / provider hooks need to redirect a user to a generic
  // error page (e.g. when the auth-server cannot be reached during a
  // login-flow startup whoami check).
  error_page_uri?: string;

  // The app ID of the frontend client app
  // This is either:
  //    A.) the UUID of the frontend client application
  //    B.) the URL of the authentication server
  app_id: string;

  // A list of API server IDs for which access tokens should be "preloaded" for
  default_audiences?: readonly string[];

  // Enable additional logging
  debug?: boolean;

  // SchemaVaults App Environment ('development', 'test', 'staging', 'production')
  app_env: SchemaVaultsAppEnvironment;

  // Whether we should enforce invite code presence during registration flows
  invite_code_required?: boolean;
}

export type { IAuthClientConstructorOptions as InitializeAuthClientOptions };
