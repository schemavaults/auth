import type {
  AccessToken,
  RefreshToken,
  UserData,
  CodeChallengeWithDetails,
  PaginationOptions,
  AuthenticateResult,
  MfaFactorType,
  MfaStatusResponse,
  MfaFactorStatusResponse,
  MfaEnrollResponse,
  MfaVerifyEnrollmentResponse,
  OrganizationMembershipRoleDetails,
  SchemaVaultsAuthErrorId,
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

  // Persist a PKCE code verifier so it can be loaded again across a full
  // page navigation (e.g. the login → /auth/mfa redirect, where the
  // verifier was created in the login form's JS context and would
  // otherwise be lost). Keyed by `challenge_time`, matching the loader.
  storeCodeVerifier: (code_verifier: string, challenge_time: number) => void;

  // Load a previously-stored PKCE code verifier by `challenge_time`.
  // Returns `null` if no verifier was stored. Used when completing a
  // login that started in a different page-load context (e.g. the MFA
  // challenge page redeeming an authorization code on the auth server's
  // own /account flow).
  loadCodeVerifier: (challenge_time: number) => string | null;

  // Send credentials to start authentication. Returns the parsed
  // AuthenticateResult discriminated union; callers must branch on `kind`
  // to handle the `mfa_required` case (see verifyMfaChallenge).
  //
  // `redirect_uri` is bound to the issued authorization code and
  // verified at the token-exchange step. Pass the same value the SDK
  // sent to `/auth/login?redirect_uri=…`. Use `null` only for the auth
  // server's own /account flow (no third-party callback).
  sendAuthenticateRequest: (
    authentication_type: AuthenticationOutcomeType,
    client_app_id: AppId,
    credentials: Credentials,
    code_challenge: CodeChallengeWithDetails,
    redirect_uri: string | null,
  ) => Promise<AuthenticateResult>;

  /**
   * Submit a TOTP code or recovery code for an in-flight MFA challenge
   * received from sendAuthenticateRequest. Resolves with the resulting
   * AuthenticateResult — `authenticated` on success, `failure` if the
   * challenge has been exhausted, or `mfa_required` is never returned
   * here (the server only returns it from the password endpoint).
   */
  verifyMfaChallenge: (
    challenge_id: string,
    client_app_id: AppId,
    proof:
      | { type: "totp"; factor_id: string; code: string }
      | { type: "recovery_code"; recovery_code: string },
  ) => Promise<AuthenticateResult>;

  /** Get the current user's MFA enrollment status. */
  getMfaStatus: () => Promise<MfaStatusResponse>;

  /**
   * Get the current user's MFA enrollment status for a single factor
   * type. Returns `{ enabled: false }` when the user has no verified
   * factor of that type.
   */
  getMfaStatusForFactorType: (
    factor_type: MfaFactorType,
  ) => Promise<MfaFactorStatusResponse>;

  /**
   * Begin TOTP enrollment for the current user. Returns the new factor's
   * id along with otpauth_url + qr_code_data_url for display.
   */
  enrollTotp: () => Promise<MfaEnrollResponse>;

  /**
   * Confirm a pending TOTP enrollment by submitting a current code. On
   * success the factor is marked verified and recovery codes are returned
   * (one-time display).
   */
  confirmTotpEnrollment: (
    factor_id: string,
    code: string,
  ) => Promise<MfaVerifyEnrollmentResponse>;

  /**
   * Remove an MFA factor by id. Requires the user's current TOTP code as
   * proof of possession.
   */
  removeFactor: (factor_id: string, code: string) => Promise<void>;

  /**
   * Regenerate the user's recovery codes. Invalidates all previous codes.
   * Requires the current TOTP code as proof.
   */
  regenerateRecoveryCodes: (
    code: string,
  ) => Promise<MfaVerifyEnrollmentResponse>;

  // Where to send the user after they are successfully logged in and have acquired access/refresh tokens
  successful_authentication_redirect_uri: string;

  // Where to send the user in order to trade an authorization code + code verifier for a refresh token
  authorize_uri: string | undefined;

  // Where to send the user when an unrecoverable error occurs in an
  // SDK-driven flow (defaults to "/auth/error" if not configured at
  // client construction). Hosting apps can override via
  // `IAuthClientConstructorOptions.error_page_uri`.
  error_page_uri: string;

  /**
   * @name buildErrorPageUrl
   * @description Build a URL to the hosting app's error page, encoding the
   *   given HTTP-style error code and SchemaVaults auth `error_id`. The
   *   `error_id` is validated against the auth-common error catalog so
   *   callers can only construct links the error page knows how to render.
   * @argument error_id A SchemaVaults auth error identifier from the
   *   auth-common error catalog
   * @argument error_code Optional HTTP-style error code (4xx-5xx); defaults to 500
   * @throws if `error_id` is not in the catalog or `error_code` is out of range
   */
  buildErrorPageUrl: (
    error_id: SchemaVaultsAuthErrorId,
    error_code?: number,
  ) => string;

  // Takes an authorization code, attempts to retrieve the code_verifier from storage using the challenge_time, and exchanges the authorization code + verifier for auth tokens.
  // The `received_state` argument is the OAuth2 `state` parameter as
  // observed on the callback URL. The SDK compares it to the value it
  // persisted before the authorize redirect and rejects any mismatch as
  // a CSRF / session-fixation attempt (RFC 6749 §10.12).
  handleSuccessfulAuthentication: (
    authorization_code: string,
    challenge_time: number,
    code_verifier?: string,
    received_state?: string | null,
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
   * @param app_id The ID of the app to authorize
   * @param state Optional OAuth2 `state` CSRF nonce for the in-flight authorize request. Not persisted server-side — only passed for API hygiene.
   * @returns A promise that resolves or rejects based on if the request succeeds
   */
  sendAuthorizeClientApplicationRequest: (
    app_id: AppId,
    state?: string | null,
  ) => Promise<void>;

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
   * @name disconnectAppFromApiServer
   * @description Revoke a previously-granted app-to-API connection, blocking the client application from requesting access tokens for that API server
   * @argument api_server_id The unique ID of the API server
   * @argument client_app_id The unique ID of the client application
   * @returns A promise resolving if the disconnection succeeds
   */
  disconnectAppFromApiServer: (
    api_server_id: ApiServerId,
    client_app_id: AppId,
  ) => Promise<void>;

  /**
   * @name checkAppToApiPermission
   * @description Check if a frontend client application has permission to access an API server
   * @argument api_server_id The unique ID of the API server
   * @argument client_app_id The unique ID of the client application
   * @returns A promise resolving to true if the permission exists, false otherwise
   */
  checkAppToApiPermission: (
    api_server_id: ApiServerId,
    client_app_id: AppId,
  ) => Promise<boolean>;

  /**
   * @name listMyOrganizationMemberships
   * @description Fetch the current user's organization memberships from
   *   `GET /api/me/organizations`. Each entry carries the organization id,
   *   display name, the user's role in that org, and the membership's
   *   creation timestamp.
   * @returns A promise resolving to a readonly array of OrganizationMembershipRoleDetails
   */
  listMyOrganizationMemberships: () => Promise<
    readonly OrganizationMembershipRoleDetails[]
  >;

  /**
   * @param feature_name Name of the feature to check if supported
   * @returns true if support, false otherwise
   */
  supports: (feature_name: string) => boolean;
}
