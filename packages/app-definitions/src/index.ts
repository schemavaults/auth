export * from "./app-id";
export type * from "./app-id";

export {
  schemaVaultsAppDefinitionSchema,
  schemaVaultsAppDomainRefSchema,
  schemaVaultsAppCallbackUrlRefSchema,
  APP_CALLBACK_URL_MAX_LENGTH,
} from "./client-app-definition";
export type * from "./client-app-definition";

export * from "./list-registry-apps-query-params";
export type * from "./list-registry-apps-query-params";

export * from "./api-server-id";
export type * from "./api-server-id";

export {
  schemaVaultsApiServerDefinitionSchema,
  schemaVaultsApiServerDomainRefSchema,
} from "./api-server-definition";
export type * from "./api-server-definition";

export * from "./list-registry-api-servers-query-params";
export type * from "./list-registry-api-servers-query-params";

export * from "./app_to_api_permission_def";
export type * from "./app_to_api_permission_def";

export {
  schemaVaultsAppEnvironments,
  schemaVaultsAppEnvironmentSchema,
  isValidSchemaVaultsAppEnvironment,
} from "./app-environments";
export type { SchemaVaultsAppEnvironment } from "./app-environments";

export { getAppEnvironment } from "./get-app-environment";

export { getAuthServerUrl } from "./get-auth-server-url";

export {
  MINIMUM_ORGANIZATION_ID_LENGTH,
  MAXIMUM_ORGANIZATION_ID_LENGTH,
  RESERVED_ORGANIZATION_IDS,
  organizationIdSchema,
  isValidOrganizationID,
} from "./organization-id";
export type { OrganizationID } from "./organization-id";

export {
  getAuthServerOwnerOrganizationId,
  DEFAULT_AUTH_SERVER_OWNER_ORGANIZATION_ID,
} from "./get-auth-server-owner-organization-id";

export {
  getAuthServerOwnerOrganizationName,
  DEFAULT_AUTH_SERVER_OWNER_ORGANIZATION_NAME,
} from "./get-auth-server-owner-organization-name";

export {
  getAuthServerFriendlyName,
  DEFAULT_AUTH_SERVER_FRIENDLY_NAME,
} from "./get-auth-server-friendly-name";

export {
  getAuthServerDescription,
  DEFAULT_AUTH_SERVER_DESCRIPTION,
} from "./get-auth-server-description";

export {
  getAuthServerAppId,
  DEFAULT_AUTH_SERVER_APP_ID,
} from "./get-auth-server-app-id";

export { getSchemaVaultsAuthAppDefinition } from "./get-schemavaults-auth-app-definition";

export { getSchemaVaultsAuthApiDefinition } from "./get-schemavaults-auth-api-definition";

export {
  OIDC_USERINFO_AUDIENCE_ID,
  getOidcUserinfoAudienceId,
} from "./oidc-userinfo-audience";

export { getOidcUserinfoApiDefinition } from "./get-oidc-userinfo-api-definition";

export {
  getTokenAudienceForApiServerId,
  getApiServerIdForTokenAudience,
} from "./audience-translation";

export {
  getHardcodedAppIdsForHardcodedApiServer,
  getHardcodedApiServerIdsAllowedForHardcodedApp,
  hasHardcodedAppToApiPermission,
} from "./hardcoded-app-to-api-permissions";

export {
  isHardcodedAppId,
  getHardcodedApp,
  getHardcodedAppDomains,
  getHardcodedSchemaVaultsApps,
  getHardcodedAppIds,
} from "./hardcoded-apps";
export type { HardcodedAppId } from "./hardcoded-apps";

export {
  isHardcodedApiServerId,
  getHardcodedApiServer,
  getHardcodedApiDomains,
  getHardcodedSchemaVaultsApis,
  getHardcodedApiServerIds,
} from "./hardcoded-apis";
export type { HardcodedApiServerId } from "./hardcoded-apis";

export { isBrowserRuntime } from "./is-browser-runtime";
