export * from "./middleware";
export type * from "./middleware";

export * from "./route_guards";
export type * from "./route_guards";

export * from "./JwtKeyManager";
export type * from "./JwtKeyManager";

export * from "./DatabaseResourceGroup";
export type * from "./DatabaseResourceGroup";

export { redirectWithError } from "./redirect-with-error";
export type * from "./redirect-with-error";

export {
  ERROR_MESSAGE_CATALOG,
  isValidErrorId,
} from "./auth-server-error-message-catalog";
export type { SchemaVaultsAuthErrorId } from "./auth-server-error-message-catalog";

import MaximumBrowserCookieSize from "./MaximumBrowserCookieSize";
export { MaximumBrowserCookieSize };

// API Server IDs
export { getSchemavaultsApiServerId } from "./get-schemavaults-api-server-id";
export type { ApiServerId } from "@schemavaults/app-definitions";
export {
  apiServerIdSchema,
  hardcodedApiServerIdSchema,
} from "@schemavaults/app-definitions";

// Client Application IDs
export { getSchemavaultsClientApplicationId } from "./get-schemavaults-client-application-id";
export type { AppId } from "@schemavaults/app-definitions";
export {
  appIdSchema,
  hardcodedAppIdSchema,
} from "@schemavaults/app-definitions";

// Cookie Names
export {
  RefreshTokenCookieName,
  RefreshTokenExpiryCookieName,
} from "./RefreshTokenCookieNames";

export { default as getStringByteSize } from "./getStringByteSize";

export { redirectToLogin } from "./redirect-to-login";
export type * from "./redirect-with-error";

export { getAppEnvironment } from "./get-app-environment";
export type { SchemaVaultsAppEnvironment } from "./get-app-environment";

// Decode helper
export { decodeJWTsWithKeyManager } from "./decode-jwts-with-key-manager";
export type { IDecodeJWTsWithKeyManagerOutput } from "./decode-jwts-with-key-manager";

// Check user organization membership from auth server (for resource servers)
export { isUserInOrganization } from "./isUserInOrganization";

// Re-export user data types
export { userDataSchema } from "@schemavaults/auth-common";
export type { UserData } from "@schemavaults/auth-common";

// Re-export organization types
export {
  organizationIdSchema,
  organizationDefinitionSchema,
  isValidOrganizationID,
  SCHEMAVAULTS_ORGANIZATION_ID,
} from "@schemavaults/auth-common";
export type {
  OrganizationID,
  OrganizationDefinition,
} from "@schemavaults/auth-common";

// Re-export app types
export type {
  SchemaVaultsApp,
  SchemaVaultsAppDomainRef,
} from "@schemavaults/app-definitions";

// Re-export API types
export type {
  SchemaVaultsApiServerDefinition,
  SchemaVaultsApiServerDomainRef,
} from "@schemavaults/app-definitions";

// Loading hardcoded apps/apis
export {
  getHardcodedApp,
  getHardcodedClientWebAppDomain,
  getHardcodedApiServer,
  getHardcodedApiServerDomain,
  getAuthServerUri,
} from "@schemavaults/app-definitions";
