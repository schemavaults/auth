export {
  SchemaVaultsAuthClient,
  SchemaVaultsAuthClient as default,
} from "./auth-client";

export type { ISchemaVaultsAuthClientAdapter } from "@/types/ISchemaVaultsAuthClientAdapter";
export type { AuthSessionRoutes } from "@/types/AuthSessionRoutes";
export { AUTH_SESSION_ROUTE_PATHS } from "./lib/session-route";

export type {
  InitializeAuthClientOptions,
  IAuthClientConstructorOptions,
} from "@/types/IAuthClientConstructorOptions";
export type { ISchemaVaultsAuthClient } from "@/types/ISchemaVaultsAuthClient";
export type {
  ClientApplicationSecretMetadata,
  GeneratedClientApplicationSecret,
} from "@/lib/client-application-secret";
export type {
  ClientApplicationServiceAccount,
  ClientApplicationServiceAccountOrganizationMembership,
  ClientApplicationServiceAccountStatus,
  CreatedClientApplicationServiceAccount,
  UpdatedClientApplicationServiceAccountOrganizationMembership,
} from "@/lib/client-application-service-account";
export type { ISendAuthenticateRequestOptions } from "@/types/ISendAuthenticateRequestOptions";
export type { AuthenticateWithRedirectOptions } from "@/types/authenticate-with-redirect-options";
export type { AuthorizeClientApplicationConsent } from "@/lib/send-authorize-client-application-request";
export type {
  RevokeClientApplicationAuthorizationResult,
  RevokeMyAppScopeConsentResult,
} from "@/lib/connected-apps";

export type { UserData } from "@/types/UserData";

// Error reporting (see `reportError()` and the `disable_telemetry` option)
export type { ReportErrorOptions } from "./lib/telemetry/build-client-error-report";
export {
  CLIENT_ERROR_REPORT_LIMITS,
  type ClientErrorReport,
} from "@schemavaults/auth-common";

// Access / Refresh Token Types
export type { AccessToken, RefreshToken } from "@schemavaults/auth-common";

// Refresh Token Cookie Names
export {
  RefreshTokenCookieName,
  RefreshTokenExpiryCookieName,
} from "@schemavaults/auth-common/RefreshTokenCookieNames";

// Auth-Common Error Catalog
export {
  isValidErrorId,
  ERROR_MESSAGE_CATALOG,
} from "@schemavaults/auth-common";
export type { SchemaVaultsAuthErrorId } from "@schemavaults/auth-common";

// Thrown by connectAppToApiServer when the connection already exists (409)
export {
  AppAlreadyConnectedToApiServerError,
  isAppAlreadyConnectedToApiServerError,
} from "@schemavaults/auth-common";

// OAuth2 `state` CSRF-nonce generation (RFC 6749 §10.12). Useful for
// consumers that want to mirror the SDK's own nonce shape in bespoke
// adapters or tests.
export { generateOAuth2State } from "./lib/generate-oauth2-state";

// The `next_href` search param route guards send users to the login page
// with (the page to return them to after signing in): validation, and
// adding it to a URL.
export {
  NEXT_HREF_SEARCH_PARAM,
  resolveNextHref,
  withNextHref,
} from "./lib/next-href";

// Login replay-nonce generation (OIDC Core §3.1.2.1 semantics, used on
// every SchemaVaults flow). Same shape/contract as generateOAuth2State.
export { generateOidcNonce } from "./lib/generate-oidc-nonce";

// Re-export the timing-safe string comparator from auth-common so
// consumers who import this SDK don't need a separate auth-common dep
// just to validate their own callback URLs.
export { timingSafeStringEqual } from "@schemavaults/auth-common";

// Auth Middleware Re-exports
export {
  AuthMiddleware,
  defaultAuthMiddlewareRules,
} from "@schemavaults/auth-common";
export type {
  AuthMiddlewareRules,
  AuthMiddlewareResult,
  AuthMiddlewareOptions,
  AuthMiddlewareError,
} from "@schemavaults/auth-common";

// Thrown by checkIfAuthenticatedWithServer (and the user data sync after
// login / token refresh) when the whoami endpoint could not be read;
// `reason` says which step failed.
export { WhoamiRequestFailedError } from "./lib/whoami-request-failed-error";
export type { WhoamiRequestFailureReason } from "./lib/whoami-request-failed-error";

// Thrown when the token endpoint refuses a code or refresh grant for a
// reason other than a lost session; `oauth_error` is its RFC 6749 §5.2
// error code (e.g. `invalid_target`: the app is not connected to the
// requested API server). `resolveLoginErrorPage()` maps a failed sign-in
// to the error page entry apps redirect to instead of retrying the login.
export { TokenEndpointRequestFailedError } from "./lib/oidc";
export {
  isTokenEndpointRequestFailedError,
  resolveLoginErrorPage,
} from "./lib/login-error-page";
export type { LoginErrorPageTarget } from "./lib/login-error-page";

// RFC 7591 dynamic client registration helper (see registerDynamicClient on
// the client) and the API server dynamic-client policy update shape.
export {
  registerDynamicClient,
  DynamicClientRegistrationFailedError,
} from "./lib/register-dynamic-client";
export type { IRegisterDynamicClientOpts } from "./lib/register-dynamic-client";
export type {
  DynamicClientRegistrationRequest,
  DynamicClientRegistrationResponse,
  DynamicClientRegistrationError,
} from "@schemavaults/auth-common";
export { apiServerDynamicClientPolicyUpdateSchema } from "./lib/update-api-server-dynamic-client-policy";
export type {
  ApiServerDynamicClientPolicy,
  ApiServerDynamicClientPolicyUpdate,
} from "./lib/update-api-server-dynamic-client-policy";
export type { ISetApiServerOrganizationMembershipVisibilityOpts } from "./lib/set-api-server-organization-membership-visibility";
export { MyOrganizationMembershipsUnavailableError } from "./lib/list-my-organization-memberships";
