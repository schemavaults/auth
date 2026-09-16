import {
  OpenAPIRegistry,
  OpenApiGeneratorV31,
  type RouteConfig,
  type ResponseConfig,
} from "@asteasolutions/zod-to-openapi";
import type {
  ExternalDocumentationObject,
  InfoObject,
  OpenAPIObject,
  SecurityRequirementObject,
  SecuritySchemeObject,
  ServerObject,
  TagObject,
} from "openapi3-ts/oas31";
import type { AuthSchemeDefinition } from "../auth-scheme";
import type { AnyOperationDefinition } from "../operation";
import { assertUniqueOperations } from "../operation";
import {
  SCHEMAVAULTS_AUTH_EXTENSION,
  SCHEMAVAULTS_SCHEME_CHALLENGE_EXTENSION,
  SCHEMAVAULTS_SCHEME_TITLE_EXTENSION,
  toSchemaVaultsAuthExtension,
} from "./extensions";

export interface BuildOpenApiDocumentOptions {
  readonly info: InfoObject;
  readonly operations: readonly AnyOperationDefinition[];
  readonly servers?: readonly ServerObject[];
  /** Tag descriptions; tags used by operations but not listed here are added bare. */
  readonly tags?: readonly TagObject[];
  readonly externalDocs?: ExternalDocumentationObject;
  /** Schemes to document even when no operation references them. */
  readonly additionalAuthSchemes?: readonly AuthSchemeDefinition[];
  /** Document-level vendor extensions. */
  readonly extensions?: Readonly<Record<`x-${string}`, unknown>>;
}

/** Every distinct auth scheme referenced by the operations (first definition wins per name). */
export function collectAuthSchemes(
  operations: readonly AnyOperationDefinition[],
  additional: readonly AuthSchemeDefinition[] = [],
): AuthSchemeDefinition[] {
  const byName = new Map<string, AuthSchemeDefinition>();
  const add = (scheme: AuthSchemeDefinition): void => {
    const existing = byName.get(scheme.name);
    if (existing && existing !== scheme) {
      const same =
        JSON.stringify(existing.securityScheme) === JSON.stringify(scheme.securityScheme);
      if (!same) {
        throw new TypeError(
          `Auth scheme "${scheme.name}" is defined twice with different security scheme objects`,
        );
      }
      return;
    }
    byName.set(scheme.name, scheme);
  };
  for (const scheme of additional) add(scheme);
  for (const operation of operations) {
    if (operation.auth.type === "required") {
      for (const scheme of operation.auth.schemes) add(scheme);
    }
  }
  return [...byName.values()];
}

export function toSecuritySchemeComponent(scheme: AuthSchemeDefinition): SecuritySchemeObject {
  return {
    ...scheme.securityScheme,
    description: scheme.securityScheme.description ?? scheme.description,
    [SCHEMAVAULTS_SCHEME_TITLE_EXTENSION]: scheme.title,
    ...(scheme.challenge !== undefined
      ? { [SCHEMAVAULTS_SCHEME_CHALLENGE_EXTENSION]: scheme.challenge }
      : {}),
  };
}

function toSecurityRequirements(operation: AnyOperationDefinition): SecurityRequirementObject[] {
  if (operation.auth.type === "public") return [];
  const scopes = [...(operation.auth.requiredScopes ?? [])];
  return operation.auth.schemes.map((scheme) => ({ [scheme.name]: scopes }));
}

/** zod-to-openapi route config for one operation (also usable with `@hono/zod-openapi`). */
export function toRouteConfig(operation: AnyOperationDefinition): RouteConfig {
  const responses: Record<string, ResponseConfig> = {};
  for (const [status, response] of Object.entries(operation.responses)) {
    responses[status] = {
      description: response.description,
      ...(response.headers ? { headers: response.headers } : {}),
      ...(response.schema
        ? {
            content: {
              [response.contentType ?? "application/json"]: { schema: response.schema },
            },
          }
        : {}),
    };
  }
  const { params, query, headers, body } = operation.request;
  return {
    method: operation.method,
    path: operation.path,
    operationId: operation.operationId,
    summary: operation.summary,
    ...(operation.description !== undefined ? { description: operation.description } : {}),
    tags: [...operation.tags],
    ...(operation.deprecated ? { deprecated: true } : {}),
    security: toSecurityRequirements(operation),
    request: {
      ...(params ? { params } : {}),
      ...(query ? { query } : {}),
      ...(headers ? { headers } : {}),
      ...(body
        ? {
            body: {
              required: body.required ?? true,
              ...(body.description !== undefined ? { description: body.description } : {}),
              content: {
                [body.contentType ?? "application/json"]: { schema: body.schema },
              },
            },
          }
        : {}),
    },
    responses,
    [SCHEMAVAULTS_AUTH_EXTENSION]: toSchemaVaultsAuthExtension(operation.auth),
    ...(operation.extensions ?? {}),
  };
}

/**
 * Builds an OpenAPI 3.1 document from operation definitions using
 * `@asteasolutions/zod-to-openapi`. Zod schemas registered with
 * `.openapi("RefId")` are emitted under `components.schemas`.
 */
export function buildOpenApiDocument(options: BuildOpenApiDocumentOptions): OpenAPIObject {
  assertUniqueOperations(options.operations);
  const registry = new OpenAPIRegistry();

  for (const scheme of collectAuthSchemes(options.operations, options.additionalAuthSchemes)) {
    registry.registerComponent("securitySchemes", scheme.name, toSecuritySchemeComponent(scheme));
  }
  for (const operation of options.operations) {
    registry.registerPath(toRouteConfig(operation));
  }

  const declaredTags = new Map<string, TagObject>();
  for (const tag of options.tags ?? []) declaredTags.set(tag.name, tag);
  for (const operation of options.operations) {
    for (const tag of operation.tags) {
      if (!declaredTags.has(tag)) declaredTags.set(tag, { name: tag });
    }
  }

  const generator = new OpenApiGeneratorV31(registry.definitions);
  return generator.generateDocument({
    openapi: "3.1.0",
    info: options.info,
    ...(options.servers ? { servers: [...options.servers] } : {}),
    ...(declaredTags.size > 0 ? { tags: [...declaredTags.values()] } : {}),
    ...(options.externalDocs ? { externalDocs: options.externalDocs } : {}),
    ...(options.extensions ?? {}),
  });
}
