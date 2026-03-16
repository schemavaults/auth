import type {
  AccessToken,
  RefreshToken,
  UserData,
  CodeChallengeWithDetails,
  PaginationOptions,
} from "@schemavaults/auth-common";
import type { Credentials } from "@/types/credentials";
import type { AuthenticationOutcomeType } from "@/lib/authentication-outcome-type";
import type { AcquireAccessTokenOptions } from "@/types/acquire-access-token-options";
import type {
  ApiServerId,
  AppId,
  ListApiServersQueryResponse,
  ListApiServersQueryType,
  ListAppsQueryResponse,
  ListAppsQueryType,
  SchemaVaultsApiServerDefinition,
  SchemaVaultsApiServerDomainRef,
  SchemaVaultsApp,
  SchemaVaultsAppDomainRef,
} from "@schemavaults/app-definitions";

export interface ISchemaVaultsAuthClient {
  version: string;
  app_id: AppId;
  auth_server_uri: string;

  // Authenticate the user
  login: () => Promise<void>;
  register: () => Promise<void>;

  successful_logout_redirect_uri: string | undefined;

  // Log the user out, clear all tokens
  logout: () => Promise<void>;

  // Generate a code_verifier, store it locally, and return a code_challenge from its SHA256 hash
  // Used in authenticate-with-redirect login /register flows
  generateCodeChallenge: () => Promise<CodeChallengeWithDetails>;

  // Send credentials to acquire an authorization code
  sendAuthenticateRequest: (
    authentication_type: AuthenticationOutcomeType,
    credentials: Credentials,
    code_challenge: CodeChallengeWithDetails,
  ) => Promise<string>;

  // Where to send the user after they are successfully logged in and have acquired access/refresh tokens
  successful_authentication_redirect_uri: string;

  // Where to send the user in order to trade an authorization code + code verifier for a refresh token
  authorize_uri: string | undefined;

  // Takes an authorization code, attempts to retrieve the code_verifier from storage using the challenge_time, and exchanges the authorization code + verifier for auth tokens
  handleSuccessfulAuthentication: (
    authorization_code: string,
    challenge_time: number,
    code_verifier?: string,
  ) => Promise<void>;

  getAccessTokenFromCache: (token_id: string) => AccessToken | null;
  getRefreshTokenFromCache: () => RefreshToken | null;
  hasHttpOnlyRefreshToken: () => boolean;

  /**
   *
   * @param opts Options for the type & how the access token should be retrieved
   * @param ensure_fresh Make sure this access token is acquired from the auth server "fresh"; don't use one from the cache (if it exists)
   * @returns AccessToken
   */
  acquireAccessToken: (opts: AcquireAccessTokenOptions) => Promise<AccessToken>;

  // Whether the client should only use HTTPS
  secure: boolean;

  // Current user data
  currentUser: UserData | null;

  /**
   * @name onAuthStateChanged
   * @param listener A callback that is called whenever an auth state change event is emitted
   * @param listener_id A unique ID for this listener, to allow it to be removed. A uuid is generated if an ID is not supplied.
   * @returns The listener_id that the callback was registered with
   */
  onAuthStateChanged: (listener: () => void, listener_id?: string) => string;

  /**
   * @name removeAuthStateChangeListener
   * @param listener_id A unique ID for the listener callback to remove
   * @returns None
   * @throws if no callback with listener_id exists, or if it was unable to be deleted
   */
  removeAuthStateChangeListener: (listener_id: string) => void;

  /**
   * @name loadSavedAuthorizationCodeVerifiers
   * @returns Code verifiers saved by auth adapter
   */
  loadSavedAuthorizationCodeVerifiers: () => Promise<Record<number, string>>;

  /**
   * @name isAuthenticated
   * @returns Getter that returns true if there is a user currently signed in, false otherwise
   * @description This works off the client's assumption that it is/isn't authenticated. Great for a quick 'am i logged in?' check.
   * @see checkIfAuthenticatedWithServer
   */
  isAuthenticated: boolean;

  /**
   * @name checkIfAuthenticatedWithServer
   * @returns A promise resolving with the current user's data (if authenticated), or null if not logged in
   * @description Sends a request to the auth server to check if the client is currently authenticated
   * @see isAuthenticated
   */
  checkIfAuthenticatedWithServer: () => Promise<UserData | null>;

  /**
   * @name sendAuthorizeClientApplicationRequest
   * @description Sends a request to the auth server to authorize a client application request auth tokens on your behalf (still need to be logged in)
   * @returns A promise that resolves or rejects based on if the request succeeds
   */
  sendAuthorizeClientApplicationRequest: (app_id: AppId) => Promise<void>;

  /**
   * @name checkAppAuthorization
   * @description Checks whether the current user has already authorized a given app
   * @returns A promise resolving to true if the app is authorized, false otherwise
   */
  checkAppAuthorization: (app_id: AppId) => Promise<boolean>;

  /**
   * @name loadClientApplicationDefinition
   * @description Load a client application definition
   * @returns A promise resolving to a SchemaVaultsApp object, if found and accessible
   */
  loadClientApplicationDefinition: (app_id: AppId) => Promise<SchemaVaultsApp>;

  /**
   * @name listClientApplications
   * @description List client applications in the auth-server database
   * @argument query_type ListAppsQueryType
   * @argument query_params URLSearchParams Additional search paramaters for the query. E.g. ?organization_id=x
   * @argument pagination PaginationOptions
   * @returns A promise resolving to a list of ListAppsQueryResponse objects, if query was met
   */
  listClientApplications: (
    query_type: ListAppsQueryType,
    query_params?: URLSearchParams,
    pagination?: PaginationOptions,
  ) => Promise<ListAppsQueryResponse>;

  /**
   * @name createClientApplication
   * @description Creates a client application reference in the auth-server database
   * @argument App definition to write to database
   * @returns A promise resolving if creation succeeds
   */
  createClientApplication: (app_definition: SchemaVaultsApp) => Promise<void>;

  /**
   * @name createClientApplicationDomain
   * @description Creates a domain for a client application in the auth-server database
   * @argument App domain definition to write to database
   * @returns A promise resolving if creation succeeds
   */
  createClientApplicationDomain: (
    app_domain_definition: SchemaVaultsAppDomainRef,
  ) => Promise<void>;

  /**
   * @name loadApiServerDefinition
   * @description Load an API server definition
   * @argument api_server_id The unique ID of the API server definition to load
   * @returns A promise resolving to a SchemaVaultsApp object, if found and accessible
   */
  loadApiServerDefinition: (
    api_server_id: ApiServerId,
  ) => Promise<SchemaVaultsApiServerDefinition>;

  /**
   * @name listApiServers
   * @description List API server definitions from the
   * @argument query_type ListApiServersQueryType
   * @argument query_params URLSearchParams Additional search paramaters for the query. E.g. ?organization_id=x
   * @argument pagination PaginationOptions
   * @returns A promise resolving to a ListApiServersQueryResponse object, if found and accessible
   */
  listApiServers: (
    query_type: ListApiServersQueryType,
    query_params?: URLSearchParams,
    pagination?: PaginationOptions,
  ) => Promise<ListApiServersQueryResponse>;

  /**
   * @name createApiServer
   * @description Create an API server reference in the auth-server database
   * @argument API server definition to write to database
   * @returns A promise resolving if creation succeeds
   */
  createApiServer: (
    api_server_definition: SchemaVaultsApiServerDefinition,
  ) => Promise<void>;

  /**
   * @name createApiServerDomain
   * @description Create a domain for an API server reference in the auth-server database
   * @argument API server domain definition to write to database
   * @returns A promise resolving if creation succeeds
   */
  createApiServerDomain: (
    api_server_domain_definition: SchemaVaultsApiServerDomainRef,
  ) => Promise<void>;

  /**
   * @name listClientApplicationDomains
   * @description List domains for a client application
   * @argument app_id The unique ID of the client application to list domains for
   * @returns A promise resolving to an array of SchemaVaultsAppDomainRef objects
   */
  listClientApplicationDomains: (
    app_id: AppId,
  ) => Promise<SchemaVaultsAppDomainRef[]>;

  /**
   * @name listApiServerDomains
   * @description List domains for an API server
   * @argument api_server_id The unique ID of the API server to list domains for
   * @returns A promise resolving to an array of SchemaVaultsApiServerDomainRef objects
   */
  listApiServerDomains: (
    api_server_id: ApiServerId,
  ) => Promise<SchemaVaultsApiServerDomainRef[]>;

  /**
   * @name deleteClientApplication
   * @description Delete a client application from the auth-server database
   * @argument app_id The unique ID of the client application to delete
   * @returns A promise resolving if deletion succeeds
   */
  deleteClientApplication: (app_id: AppId) => Promise<void>;

  /**
   * @name deleteApiServer
   * @description Delete an API server from the auth-server database
   * @argument api_server_id The unique ID of the API server to delete
   * @returns A promise resolving if deletion succeeds
   */
  deleteApiServer: (api_server_id: ApiServerId) => Promise<void>;

  /**
   * @name connectAppToApiServer
   * @description Connect a frontend client application to an API server, allowing it to request access tokens for that API
   * @argument api_server_id The unique ID of the API server
   * @argument client_app_id The unique ID of the client application
   * @returns A promise resolving if the connection succeeds
   */
  connectAppToApiServer: (
    api_server_id: ApiServerId,
    client_app_id: AppId,
  ) => Promise<void>;

  /**
   * @param feature_name Name of the feature to check if supported
   * @returns true if support, false otherwise
   */
  supports: (feature_name: string) => boolean;
}
