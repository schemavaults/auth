export {
  SchemaVaultsAuthClient,
  SchemaVaultsAuthClient as default,
} from "./auth-client";

export type { ISchemaVaultsAuthClientAdapter } from "@/types/ISchemaVaultsAuthClientAdapter";

export type {
  InitializeAuthClientOptions,
  IAuthClientConstructorOptions,
} from "@/types/IAuthClientConstructorOptions";
export type { ISchemaVaultsAuthClient } from "@/types/ISchemaVaultsAuthClient";
export type {
  ClientApplicationSecretMetadata,
  GeneratedClientApplicationSecret,
} from "@/lib/client-application-secret";
export type { ISendAuthenticateRequestOptions } from "@/types/ISendAuthenticateRequestOptions";

export type { UserData } from "@/types/UserData";

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
