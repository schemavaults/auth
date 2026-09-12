/**
 * Framework-agnostic, JSON-serialisable view of an OpenAPI 3.x document,
 * shaped for browsing: one entry per operation with its parameters,
 * bodies, responses and the SchemaVaults auth requirements resolved.
 * Built by `parseOpenApiDocument()`; safe to pass from server to client
 * components.
 */

export const API_DOCS_HTTP_METHODS = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
  "TRACE",
] as const;
export type ApiDocsHttpMethod = (typeof API_DOCS_HTTP_METHODS)[number];

/** OpenAPI 3.1 schema object (JSON Schema dialect), kept as plain JSON. */
export type ApiDocsJsonSchema = { readonly [key: string]: unknown };

export type ApiDocsParameterLocation = "path" | "query" | "header" | "cookie";

export interface ApiDocsParameter {
  readonly name: string;
  readonly in: ApiDocsParameterLocation;
  readonly required: boolean;
  readonly description?: string;
  readonly deprecated: boolean;
  readonly schema: ApiDocsJsonSchema | null;
  readonly example?: unknown;
}

export interface ApiDocsMediaType {
  readonly contentType: string;
  readonly schema: ApiDocsJsonSchema | null;
  readonly example?: unknown;
}

export interface ApiDocsRequestBody {
  readonly required: boolean;
  readonly description?: string;
  readonly content: readonly ApiDocsMediaType[];
}

export interface ApiDocsResponseHeader {
  readonly name: string;
  readonly description?: string;
  readonly schema: ApiDocsJsonSchema | null;
}

export interface ApiDocsResponse {
  /** Status code or `default`. */
  readonly status: string;
  readonly description: string;
  readonly content: readonly ApiDocsMediaType[];
  readonly headers: readonly ApiDocsResponseHeader[];
}

/** One scheme inside a security requirement alternative (`{ name: scopes }`). */
export interface ApiDocsSecurityRequirement {
  readonly schemeName: string;
  readonly scopes: readonly string[];
}

export type ApiDocsRouteGuard = "authenticated" | "admin";

export interface ApiDocsOrganizationRequirement {
  readonly parameter: string;
  readonly roles: readonly string[];
  readonly adminBypass: boolean;
}

export interface ApiDocsAuth {
  readonly public: boolean;
  /**
   * OpenAPI security alternatives: the outer list is OR, each inner list is
   * AND (all schemes of that alternative must be presented together).
   */
  readonly alternatives: readonly (readonly ApiDocsSecurityRequirement[])[];
  /** Names of every scheme that can satisfy the operation. */
  readonly schemeNames: readonly string[];
  readonly routeGuard: ApiDocsRouteGuard | null;
  readonly requiredScopes: readonly string[];
  readonly organization: ApiDocsOrganizationRequirement | null;
  readonly notes?: string;
  /** Whether the details came from the `x-schemavaults-auth` extension (vs. plain `security`). */
  readonly source: "x-schemavaults-auth" | "security" | "none";
}

export interface ApiDocsOperation {
  /** URL-safe, unique id used for the docs sub-page route. */
  readonly slug: string;
  readonly method: ApiDocsHttpMethod;
  readonly path: string;
  readonly operationId?: string;
  readonly summary: string;
  readonly description?: string;
  readonly tags: readonly string[];
  readonly deprecated: boolean;
  readonly parameters: readonly ApiDocsParameter[];
  readonly requestBody: ApiDocsRequestBody | null;
  readonly responses: readonly ApiDocsResponse[];
  readonly auth: ApiDocsAuth;
  readonly externalDocsUrl?: string;
}

export interface ApiDocsSecurityScheme {
  readonly name: string;
  readonly type: string;
  readonly title: string;
  readonly description?: string;
  /** `apiKey`: where the key travels. */
  readonly in?: string;
  /** `apiKey`: header / cookie / query parameter name. */
  readonly parameterName?: string;
  /** `http`: `bearer`, `basic`, ... */
  readonly scheme?: string;
  readonly bearerFormat?: string;
  readonly openIdConnectUrl?: string;
  readonly challenge?: string;
  /** `oauth2` flow names present (`authorizationCode`, ...). */
  readonly flows: readonly string[];
}

export interface ApiDocsTag {
  readonly name: string;
  readonly description?: string;
  readonly operations: readonly ApiDocsOperation[];
}

export interface ApiDocsServer {
  readonly url: string;
  readonly description?: string;
}

export interface ApiDocsModel {
  readonly openapiVersion: string;
  readonly title: string;
  readonly version: string;
  readonly description?: string;
  readonly servers: readonly ApiDocsServer[];
  /** Operations grouped by tag (untagged ones land under {@link UNTAGGED_TAG_NAME}). */
  readonly tags: readonly ApiDocsTag[];
  /** Every operation in document order. */
  readonly operations: readonly ApiDocsOperation[];
  readonly securitySchemes: readonly ApiDocsSecurityScheme[];
  /** `components.schemas`, for resolving `$ref`s while rendering. */
  readonly schemas: Readonly<Record<string, ApiDocsJsonSchema>>;
}

export const UNTAGGED_TAG_NAME = "Other" as const;
