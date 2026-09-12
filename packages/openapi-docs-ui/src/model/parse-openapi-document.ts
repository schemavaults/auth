import {
  API_DOCS_HTTP_METHODS,
  UNTAGGED_TAG_NAME,
  type ApiDocsAuth,
  type ApiDocsHttpMethod,
  type ApiDocsJsonSchema,
  type ApiDocsMediaType,
  type ApiDocsModel,
  type ApiDocsOperation,
  type ApiDocsParameter,
  type ApiDocsParameterLocation,
  type ApiDocsRequestBody,
  type ApiDocsResponse,
  type ApiDocsResponseHeader,
  type ApiDocsSecurityRequirement,
  type ApiDocsSecurityScheme,
  type ApiDocsTag,
} from "./types";
import { operationSlug } from "./slug";

type Json = { readonly [key: string]: unknown };

function isRecord(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/** Follows a local `$ref` (`#/components/...`) inside the document. */
function resolveLocalRef(document: Json, ref: string): unknown {
  if (!ref.startsWith("#/")) return undefined;
  let current: unknown = document;
  for (const rawSegment of ref.slice(2).split("/")) {
    const segment = rawSegment.replace(/~1/g, "/").replace(/~0/g, "~");
    if (!isRecord(current)) return undefined;
    current = current[segment];
  }
  return current;
}

/** Dereferences a (possibly `$ref`) object at the top level only; schemas keep their refs. */
function deref(document: Json, value: unknown, depth = 0): Json | undefined {
  if (!isRecord(value)) return undefined;
  const ref = str(value.$ref);
  if (ref && depth < 8) {
    const target = resolveLocalRef(document, ref);
    return deref(document, target, depth + 1);
  }
  return value;
}

function toSchema(value: unknown): ApiDocsJsonSchema | null {
  if (isRecord(value)) return value;
  if (typeof value === "boolean") return { type: value ? "any" : "never" };
  return null;
}

function parseMediaTypes(document: Json, content: unknown): ApiDocsMediaType[] {
  if (!isRecord(content)) return [];
  return Object.entries(content).map(([contentType, mediaType]) => {
    const resolved = deref(document, mediaType) ?? {};
    return {
      contentType,
      schema: toSchema(resolved.schema),
      ...(resolved.example !== undefined ? { example: resolved.example } : {}),
    };
  });
}

function parseParameter(document: Json, raw: unknown): ApiDocsParameter | null {
  const parameter = deref(document, raw);
  if (!parameter) return null;
  const name = str(parameter.name);
  const location = str(parameter.in);
  if (!name || !location) return null;
  if (!["path", "query", "header", "cookie"].includes(location)) return null;
  return {
    name,
    in: location as ApiDocsParameterLocation,
    required: location === "path" ? true : bool(parameter.required, false),
    ...(str(parameter.description) !== undefined ? { description: str(parameter.description) } : {}),
    deprecated: bool(parameter.deprecated, false),
    schema: toSchema(parameter.schema),
    ...(parameter.example !== undefined ? { example: parameter.example } : {}),
  };
}

function parseRequestBody(document: Json, raw: unknown): ApiDocsRequestBody | null {
  const body = deref(document, raw);
  if (!body) return null;
  return {
    required: bool(body.required, false),
    ...(str(body.description) !== undefined ? { description: str(body.description) } : {}),
    content: parseMediaTypes(document, body.content),
  };
}

function parseResponses(document: Json, raw: unknown): ApiDocsResponse[] {
  if (!isRecord(raw)) return [];
  return Object.entries(raw).map(([status, value]) => {
    const response = deref(document, value) ?? {};
    const headers: ApiDocsResponseHeader[] = isRecord(response.headers)
      ? Object.entries(response.headers).map(([name, header]) => {
          const resolved = deref(document, header) ?? {};
          return {
            name,
            ...(str(resolved.description) !== undefined ? { description: str(resolved.description) } : {}),
            schema: toSchema(resolved.schema),
          };
        })
      : [];
    return {
      status,
      description: str(response.description) ?? "",
      content: parseMediaTypes(document, response.content),
      headers,
    };
  });
}

function parseSecurityAlternatives(raw: unknown): ApiDocsSecurityRequirement[][] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(isRecord)
    .map((alternative) =>
      Object.entries(alternative).map(([schemeName, scopes]) => ({
        schemeName,
        scopes: Array.isArray(scopes) ? scopes.filter((s): s is string => typeof s === "string") : [],
      })),
    )
    .filter((alternative) => alternative.length > 0);
}

function uniqueStrings(values: readonly string[]): string[] {
  return Array.from(new Set(values));
}

function parseAuth(operation: Json, documentSecurity: unknown): ApiDocsAuth {
  const hasOwnSecurity = Array.isArray(operation.security);
  const alternatives = parseSecurityAlternatives(
    hasOwnSecurity ? operation.security : documentSecurity,
  );
  const schemeNames = uniqueStrings(
    alternatives.flatMap((alternative) => alternative.map((requirement) => requirement.schemeName)),
  );
  const scopesFromSecurity = uniqueStrings(
    alternatives.flatMap((alternative) => alternative.flatMap((requirement) => requirement.scopes)),
  );

  const extension = operation["x-schemavaults-auth"];
  if (isRecord(extension) && typeof extension.public === "boolean") {
    const organization = isRecord(extension.organization)
      ? {
          parameter: str(extension.organization.parameter) ?? "",
          roles: Array.isArray(extension.organization.roles)
            ? extension.organization.roles.filter((r): r is string => typeof r === "string")
            : [],
          adminBypass: bool(extension.organization.adminBypass, true),
        }
      : null;
    const routeGuard = extension.routeGuard;
    const extensionSchemes = Array.isArray(extension.schemes)
      ? extension.schemes.filter((s): s is string => typeof s === "string")
      : [];
    return {
      public: extension.public,
      alternatives,
      schemeNames: uniqueStrings([...extensionSchemes, ...schemeNames]),
      routeGuard: routeGuard === "authenticated" || routeGuard === "admin" ? routeGuard : null,
      requiredScopes: Array.isArray(extension.requiredScopes)
        ? extension.requiredScopes.filter((s): s is string => typeof s === "string")
        : scopesFromSecurity,
      organization,
      ...(str(extension.notes) !== undefined ? { notes: str(extension.notes) } : {}),
      source: "x-schemavaults-auth",
    };
  }

  const isPublic = alternatives.length === 0;
  return {
    public: isPublic,
    alternatives,
    schemeNames,
    routeGuard: isPublic ? null : "authenticated",
    requiredScopes: scopesFromSecurity,
    organization: null,
    source: isPublic && !hasOwnSecurity && !Array.isArray(documentSecurity) ? "none" : "security",
  };
}

function parseSecuritySchemes(document: Json): ApiDocsSecurityScheme[] {
  const components = isRecord(document.components) ? document.components : {};
  const schemes = isRecord(components.securitySchemes) ? components.securitySchemes : {};
  return Object.entries(schemes).flatMap(([name, raw]): ApiDocsSecurityScheme[] => {
    const scheme = deref(document, raw);
    if (!scheme) return [];
    const type = str(scheme.type) ?? "unknown";
    const flows = isRecord(scheme.flows) ? Object.keys(scheme.flows) : [];
    return [
      {
        name,
        type,
        title: str(scheme["x-schemavaults-title"]) ?? defaultSchemeTitle(name, scheme),
        ...(str(scheme.description) !== undefined ? { description: str(scheme.description) } : {}),
        ...(str(scheme.in) !== undefined ? { in: str(scheme.in) } : {}),
        ...(str(scheme.name) !== undefined ? { parameterName: str(scheme.name) } : {}),
        ...(str(scheme.scheme) !== undefined ? { scheme: str(scheme.scheme) } : {}),
        ...(str(scheme.bearerFormat) !== undefined ? { bearerFormat: str(scheme.bearerFormat) } : {}),
        ...(str(scheme.openIdConnectUrl) !== undefined
          ? { openIdConnectUrl: str(scheme.openIdConnectUrl) }
          : {}),
        ...(str(scheme["x-schemavaults-challenge"]) !== undefined
          ? { challenge: str(scheme["x-schemavaults-challenge"]) }
          : {}),
        flows,
      },
    ];
  });
}

function defaultSchemeTitle(name: string, scheme: Json): string {
  const type = str(scheme.type);
  if (type === "http") {
    const httpScheme = str(scheme.scheme);
    return httpScheme ? `HTTP ${httpScheme[0]?.toUpperCase()}${httpScheme.slice(1)} (${name})` : name;
  }
  if (type === "apiKey") return `API key in ${str(scheme.in) ?? "request"} (${name})`;
  if (type === "oauth2") return `OAuth 2.0 (${name})`;
  if (type === "openIdConnect") return `OpenID Connect (${name})`;
  return name;
}

function ensureUniqueSlug(slug: string, taken: Set<string>, operationId: string | undefined): string {
  if (!taken.has(slug)) {
    taken.add(slug);
    return slug;
  }
  const withId = operationId ? `${slug}-${operationId.toLowerCase().replace(/[^a-z0-9_-]+/g, "-")}` : slug;
  let candidate = withId;
  let counter = 2;
  while (taken.has(candidate)) {
    candidate = `${withId}-${counter}`;
    counter += 1;
  }
  taken.add(candidate);
  return candidate;
}

/**
 * Parses an OpenAPI 3.x document (as produced by
 * `@schemavaults/openapi-operations` or any other generator) into an
 * {@link ApiDocsModel}. Unknown or malformed pieces are skipped rather
 * than thrown on, so a partially valid document still renders.
 */
export function parseOpenApiDocument(input: unknown): ApiDocsModel {
  if (!isRecord(input)) {
    throw new TypeError("parseOpenApiDocument expects an OpenAPI document object");
  }
  const document = input;
  const info = isRecord(document.info) ? document.info : {};
  const paths = isRecord(document.paths) ? document.paths : {};
  const taken = new Set<string>();
  const operations: ApiDocsOperation[] = [];

  for (const [path, rawItem] of Object.entries(paths)) {
    const pathItem = deref(document, rawItem);
    if (!pathItem) continue;
    const sharedParameters = Array.isArray(pathItem.parameters) ? pathItem.parameters : [];
    for (const method of API_DOCS_HTTP_METHODS) {
      const raw = pathItem[method.toLowerCase()];
      if (!isRecord(raw)) continue;
      const operationId = str(raw.operationId);
      const ownParameters = Array.isArray(raw.parameters) ? raw.parameters : [];
      const parameters = mergeParameters(
        [...sharedParameters, ...ownParameters]
          .map((parameter) => parseParameter(document, parameter))
          .filter((parameter): parameter is ApiDocsParameter => parameter !== null),
      );
      const tags = Array.isArray(raw.tags)
        ? raw.tags.filter((tag): tag is string => typeof tag === "string")
        : [];
      const externalDocs = isRecord(raw.externalDocs) ? str(raw.externalDocs.url) : undefined;
      operations.push({
        slug: ensureUniqueSlug(operationSlug(method, path), taken, operationId),
        method: method as ApiDocsHttpMethod,
        path,
        ...(operationId !== undefined ? { operationId } : {}),
        summary: str(raw.summary) ?? operationId ?? `${method} ${path}`,
        ...(str(raw.description) !== undefined ? { description: str(raw.description) } : {}),
        tags,
        deprecated: bool(raw.deprecated, false),
        parameters,
        requestBody: parseRequestBody(document, raw.requestBody),
        responses: parseResponses(document, raw.responses),
        auth: parseAuth(raw, document.security),
        ...(externalDocs !== undefined ? { externalDocsUrl: externalDocs } : {}),
      });
    }
  }

  const tagDescriptions = new Map<string, string | undefined>();
  if (Array.isArray(document.tags)) {
    for (const tag of document.tags) {
      if (isRecord(tag) && typeof tag.name === "string") {
        tagDescriptions.set(tag.name, str(tag.description));
      }
    }
  }
  const grouped = new Map<string, ApiDocsOperation[]>();
  for (const name of tagDescriptions.keys()) grouped.set(name, []);
  for (const operation of operations) {
    const names = operation.tags.length > 0 ? operation.tags : [UNTAGGED_TAG_NAME];
    for (const name of names) {
      const bucket = grouped.get(name) ?? [];
      bucket.push(operation);
      grouped.set(name, bucket);
    }
  }
  const tags: ApiDocsTag[] = [...grouped.entries()]
    .filter(([, ops]) => ops.length > 0)
    .map(([name, ops]) => {
      const description = tagDescriptions.get(name);
      return { name, ...(description !== undefined ? { description } : {}), operations: ops };
    });

  const components = isRecord(document.components) ? document.components : {};
  const schemas: Record<string, ApiDocsJsonSchema> = {};
  if (isRecord(components.schemas)) {
    for (const [name, schema] of Object.entries(components.schemas)) {
      const parsed = toSchema(schema);
      if (parsed) schemas[name] = parsed;
    }
  }

  const servers: ApiDocsModel["servers"] = Array.isArray(document.servers)
    ? document.servers.flatMap((server) => {
        if (!isRecord(server) || typeof server.url !== "string") return [];
        const description = str(server.description);
        return [{ url: server.url, ...(description !== undefined ? { description } : {}) }];
      })
    : [];

  return {
    openapiVersion: str(document.openapi) ?? "3.1.0",
    title: str(info.title) ?? "API",
    version: str(info.version) ?? "",
    ...(str(info.description) !== undefined ? { description: str(info.description) } : {}),
    servers,
    tags,
    operations,
    securitySchemes: parseSecuritySchemes(document),
    schemas,
  };
}

/** Operation-level parameters override path-level ones with the same name+location. */
function mergeParameters(parameters: readonly ApiDocsParameter[]): ApiDocsParameter[] {
  const byKey = new Map<string, ApiDocsParameter>();
  for (const parameter of parameters) byKey.set(`${parameter.in}:${parameter.name}`, parameter);
  const order: ApiDocsParameterLocation[] = ["path", "query", "header", "cookie"];
  return [...byKey.values()].sort((a, b) => order.indexOf(a.in) - order.indexOf(b.in));
}
