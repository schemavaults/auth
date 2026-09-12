export { z } from "./zod";
export type { ZodType, ZodObject } from "./zod";

export { HTTP_METHODS, HTTP_METHODS_WITH_REQUEST_BODY, isHttpMethod } from "./http-method";
export type { HttpMethod } from "./http-method";

export {
  defineAuthScheme,
  publicAccess,
  requireAuth,
  isPublicOperationAuth,
  ROUTE_GUARD_TYPES,
  schemaVaultsAccessTokenBearerScheme,
  schemaVaultsAccessTokenCookieScheme,
  schemaVaultsRefreshTokenCookieScheme,
  oidcClientSecretBasicScheme,
  oidcClientSecretPostScheme,
  apiKeyHeaderScheme,
} from "./auth-scheme";
export type {
  AuthSchemeDefinition,
  AuthRequirements,
  OperationAuth,
  PublicOperationAuth,
  RequiredOperationAuth,
  OrganizationRoleRequirement,
  RouteGuardType,
} from "./auth-scheme";

export {
  defineOperation,
  createOperationDefiner,
  defineOperationGroup,
  defaultOperationId,
  assertUniqueOperations,
} from "./operation";
export type {
  AnyOperationDefinition,
  AuthPrincipal,
  EmptyResponseStatusOf,
  InferBody,
  InferParsed,
  OperationDefiner,
  OperationDefinition,
  OperationGroup,
  OperationHandlerContext,
  OperationHandlerResult,
  OperationInput,
  OperationRequestDefinition,
  RequestBodyContentType,
  RequestBodyDefinition,
  ResponseBodyOf,
  ResponseDefinition,
  ResponseStatusOf,
  ResponsesDefinition,
} from "./operation";

export {
  buildOpenApiDocument,
  collectAuthSchemes,
  toRouteConfig,
  toSecuritySchemeComponent,
} from "./openapi/build-openapi-document";
export type { BuildOpenApiDocumentOptions } from "./openapi/build-openapi-document";
export {
  SCHEMAVAULTS_AUTH_EXTENSION,
  SCHEMAVAULTS_SCHEME_TITLE_EXTENSION,
  SCHEMAVAULTS_SCHEME_CHALLENGE_EXTENSION,
  toSchemaVaultsAuthExtension,
  isSchemaVaultsAuthExtension,
} from "./openapi/extensions";
export type { SchemaVaultsAuthExtension } from "./openapi/extensions";
export {
  extractPathParameterNames,
  openApiPathToHonoPath,
  honoPathToOpenApiPath,
  isOpenApiPath,
} from "./openapi/path-format";

export * from "./hono";
export { toVercelHandler } from "./adapters/vercel";
export type { VercelFunctionHandler } from "./adapters/vercel";
export { toNextRouteHandlers } from "./adapters/nextjs";
export type { NextRouteHandler, NextRouteHandlers } from "./adapters/nextjs";
