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

  // The auth server deployment's own app ID (env-var driven for white-label
  // deployments, e.g. "acme-corp-auth"). Pass this on the auth server's own
  // frontend so the client can recognize itself as the auth server; external
  // resource servers can omit it. Defaults to "schemavaults-auth".
  auth_server_app_id?: string;

  // A list of API server IDs for which access tokens should be "preloaded" for
  default_audiences?: readonly string[];

  // Enable additional logging
  debug?: boolean;

  // SchemaVaults App Environment ('development', 'test', 'staging', 'production')
  app_env: SchemaVaultsAppEnvironment;

  // Whether we should enforce invite code presence during registration flows
  invite_code_required?: boolean;

  // Opt out of error reporting. By default the SDK reports the failures of
  // its own auth flows (login redirect, callback handling, token acquisition,
  // session checks) to the auth server's client error intake
  // (POST /api/client-errors/{app_id}), where platform administrators browse
  // them. A report carries the error's name, message and stack, the page's
  // origin and path (never its query string), the SDK version, the app
  // environment and the signed-in user's uid. Set to true to send nothing;
  // `reportError()` then does nothing either.
  disable_telemetry?: boolean;
}

export type { IAuthClientConstructorOptions as InitializeAuthClientOptions };
