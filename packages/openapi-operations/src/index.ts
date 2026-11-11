export { z, withOpenApi } from "./zod-openapi";
export type { ZodType, ZodObject, OpenApiSchemaMetadata } from "./zod-openapi";

export { HTTP_METHODS, HTTP_METHODS_WITH_REQUEST_BODY, isHttpMethod } from "./http-method";
export type { HttpMethod } from "./http-method";

export {
  defineAuthScheme,
  AUTH_PRINCIPAL_KINDS,
  isValidAuthPrincipalKind,
  schemeResolvesUser,
  publicAccess,
  requireAuth,
  isPublicOperationAuth,
  ROUTE_GUARD_TYPES,
  DELEGATED_CALLER_POLICIES,
  isDelegatedCallerPolicy,
  schemaVaultsAccessTokenBearerScheme,
  schemaVaultsAccessTokenCookieScheme,
  schemaVaultsRefreshTokenCookieScheme,
  oidcClientSecretBasicScheme,
  oidcClientSecretPostScheme,
  apiKeyHeaderScheme,
} from "./auth-scheme";
export type {
  AllSchemesResolveUser,
  AuthPrincipalKind,
  AuthSchemeDefinition,
  AuthRequirements,
  DelegatedCallerPolicy,
  UserAuthSchemeDefinition,
  OperationAuth,
  PublicOperationAuth,
  RequiredOperationAuth,
  OrganizationRoleRequirement,
  RouteGuardType,
} from "./auth-scheme";

export {
  SCOPE_TOKEN_REGEX,
  isScopeToken,
  isScopeDefinition,
  scopeValue,
  scopeValues,
  defineScope,
  defineScopes,
  assertScopeRequirements,
  collectScopes,
  oidcScopes,
} from "./scopes";
export type { DefinedScopes, DocumentedScope, ScopeDefinition, ScopeRequirement } from "./scopes";

export {
  defineOperation,
  createOperationDefiner,
  defineOperationGroup,
  defaultOperationId,
  assertUniqueOperations,
  operationHttpMethods,
} from "./operation";
export type {
  AnyOperationDefinition,
  AuthPrincipal,
  AuthPrincipalActor,
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
  ResolvedAuthPrincipal,
  ResponseBodyOf,
  ResponseDefinition,
  ResponseStatusOf,
  ResponsesDefinition,
  UserAuthPrincipal,
} from "./operation";

export {
  buildOpenApiDocument,
  collectAuthSchemes,
  toRouteConfig,
  toSecuritySchemeComponent,
} from "./openapi/build-openapi-document";
export type { BuildOpenApiDocumentOptions } from "./openapi/build-openapi-document";
export { runtimeErrorResponses, withRuntimeErrorResponses } from "./openapi/runtime-responses";
// Re-exported so hosts can type generated documents without depending on openapi3-ts.
export type { OpenAPIObject } from "openapi3-ts/oas31";
export {
  SCHEMAVAULTS_AUTH_EXTENSION,
  SCHEMAVAULTS_SCHEME_TITLE_EXTENSION,
  SCHEMAVAULTS_SCHEME_CHALLENGE_EXTENSION,
  SCHEMAVAULTS_SCOPES_EXTENSION,
  toSchemaVaultsAuthExtension,
  isSchemaVaultsAuthExtension,
  isSchemaVaultsScopesExtension,
} from "./openapi/extensions";
export type { SchemaVaultsAuthExtension, SchemaVaultsScopesExtension } from "./openapi/extensions";
export {
  extractPathParameterNames,
  openApiPathToHonoPath,
  honoPathToOpenApiPath,
  isOpenApiPath,
} from "./openapi/path-format";

export * from "./runtime";
// Re-exported so hosts can type auth resolvers / read cookies without a
// direct dependency on hono (isolated installs do not expose transitive deps).
export type { Hono, Context as HonoContext } from "hono";
export { getCookie, getSignedCookie } from "hono/cookie";
export { toVercelHandler } from "./adapters/vercel";
export type { VercelFunctionHandler } from "./adapters/vercel";
export { toNextRouteHandlers } from "./adapters/nextjs";
export type { NextRouteHandler, NextRouteHandlers } from "./adapters/nextjs";
