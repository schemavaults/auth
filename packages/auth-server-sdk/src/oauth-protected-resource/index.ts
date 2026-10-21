export {
  createOAuthProtectedResourceMetadataRoute,
  type OAuthProtectedResourceMetadataRouteHandler,
  type OAuthProtectedResourceMetadataRouteOptions,
} from "./route";
export {
  OAUTH_PROTECTED_RESOURCE_WELL_KNOWN_PATH,
  buildOAuthProtectedResourceMetadata,
  isMetadataRequestForResource,
  oauthProtectedResourceMetadataUrl,
  type BuildOAuthProtectedResourceMetadataOptions,
  type OAuthProtectedResourceMetadata,
  type OAuthProtectedResourceMetadataDetails,
} from "./protected-resource-metadata";
export {
  RESOURCE_URL_ENV_VAR_NAME,
  getSchemaVaultsResourceUrl,
  parseResourceUrl,
  resourceUrlAudiences,
} from "@/env/get-schemavaults-resource-url";
