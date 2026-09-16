import type { ApiDocsJsonSchema, ApiDocsModel } from "./types";

const SCHEMA_REF_PREFIX = "#/components/schemas/";

/** Name of the component a `$ref` points at, or null for non-component refs. */
export function schemaRefName(schema: ApiDocsJsonSchema | null | undefined): string | null {
  const ref = schema?.$ref;
  if (typeof ref !== "string" || !ref.startsWith(SCHEMA_REF_PREFIX)) return null;
  return decodeURIComponent(ref.slice(SCHEMA_REF_PREFIX.length));
}

/** Follows `$ref`s into `components.schemas` (bounded, cycle-safe). */
export function resolveSchema(
  schema: ApiDocsJsonSchema | null | undefined,
  schemas: ApiDocsModel["schemas"],
  maxDepth = 8,
): ApiDocsJsonSchema | null {
  let current = schema ?? null;
  const seen = new Set<string>();
  for (let depth = 0; depth < maxDepth && current; depth += 1) {
    const name = schemaRefName(current);
    if (name === null) return current;
    if (seen.has(name)) return current;
    seen.add(name);
    current = schemas[name] ?? null;
  }
  return current;
}

/** Short human readable type label: `string`, `integer (int64)`, `App[]`, `A | B`, ... */
export function schemaTypeLabel(
  schema: ApiDocsJsonSchema | null | undefined,
  schemas: ApiDocsModel["schemas"],
  depth = 0,
): string {
  if (!schema) return "unknown";
  const refName = schemaRefName(schema);
  if (refName !== null) return refName;
  if (depth > 3) return "…";
  const compose = (list: unknown, joiner: string): string | null =>
    Array.isArray(list)
      ? list
          .map((entry) => schemaTypeLabel(entry as ApiDocsJsonSchema, schemas, depth + 1))
          .join(joiner)
      : null;
  const oneOf = compose(schema.oneOf, " | ");
  if (oneOf) return oneOf;
  const anyOf = compose(schema.anyOf, " | ");
  if (anyOf) return anyOf;
  const allOf = compose(schema.allOf, " & ");
  if (allOf) return allOf;
  if (Array.isArray(schema.enum)) {
    return schema.enum.map((value) => JSON.stringify(value)).join(" | ");
  }
  if (schema.const !== undefined) return JSON.stringify(schema.const);
  const rawType = schema.type;
  const types = Array.isArray(rawType)
    ? rawType.filter((t): t is string => typeof t === "string")
    : typeof rawType === "string"
      ? [rawType]
      : [];
  if (types.length === 0) {
    if (schema.properties) return "object";
    if (schema.items) return `${schemaTypeLabel(schema.items as ApiDocsJsonSchema, schemas, depth + 1)}[]`;
    return "any";
  }
  return types
    .map((type) => {
      if (type === "array") {
        return `${schemaTypeLabel(schema.items as ApiDocsJsonSchema, schemas, depth + 1)}[]`;
      }
      const format = typeof schema.format === "string" ? ` (${schema.format})` : "";
      return `${type}${format}`;
    })
    .join(" | ");
}

export function isNullableSchema(schema: ApiDocsJsonSchema | null | undefined): boolean {
  if (!schema) return false;
  if (schema.nullable === true) return true;
  if (Array.isArray(schema.type) && schema.type.includes("null")) return true;
  const anyOf = Array.isArray(schema.anyOf) ? schema.anyOf : Array.isArray(schema.oneOf) ? schema.oneOf : [];
  return anyOf.some((entry) => typeof entry === "object" && entry !== null && (entry as ApiDocsJsonSchema).type === "null");
}

export interface SchemaProperty {
  readonly name: string;
  readonly schema: ApiDocsJsonSchema | null;
  readonly required: boolean;
}

/** Properties of an object schema (after resolving `$ref` / merging `allOf`). */
export function schemaProperties(
  schema: ApiDocsJsonSchema | null | undefined,
  schemas: ApiDocsModel["schemas"],
): SchemaProperty[] {
  const resolved = resolveSchema(schema, schemas);
  if (!resolved) return [];
  const merged: Record<string, unknown> = {};
  const required = new Set<string>();
  const visit = (candidate: ApiDocsJsonSchema | null, depth: number): void => {
    const target = resolveSchema(candidate, schemas);
    if (!target || depth > 6) return;
    if (Array.isArray(target.allOf)) {
      for (const part of target.allOf) visit(part as ApiDocsJsonSchema, depth + 1);
    }
    if (typeof target.properties === "object" && target.properties !== null) {
      Object.assign(merged, target.properties);
    }
    if (Array.isArray(target.required)) {
      for (const name of target.required) if (typeof name === "string") required.add(name);
    }
  };
  visit(resolved, 0);
  return Object.entries(merged).map(([name, value]) => ({
    name,
    schema: typeof value === "object" && value !== null ? (value as ApiDocsJsonSchema) : null,
    required: required.has(name),
  }));
}

/** Builds an illustrative example value from a schema (uses `example`/`default`/`enum` when present). */
export function exampleFromSchema(
  schema: ApiDocsJsonSchema | null | undefined,
  schemas: ApiDocsModel["schemas"],
  depth = 0,
): unknown {
  const resolved = resolveSchema(schema, schemas);
  if (!resolved || depth > 6) return null;
  if (resolved.example !== undefined) return resolved.example;
  if (Array.isArray(resolved.examples) && resolved.examples.length > 0) return resolved.examples[0];
  if (resolved.default !== undefined) return resolved.default;
  if (resolved.const !== undefined) return resolved.const;
  if (Array.isArray(resolved.enum) && resolved.enum.length > 0) return resolved.enum[0];
  const variants = Array.isArray(resolved.oneOf)
    ? resolved.oneOf
    : Array.isArray(resolved.anyOf)
      ? resolved.anyOf
      : null;
  if (variants && variants.length > 0) {
    const nonNull = variants.find(
      (variant) => !(typeof variant === "object" && variant !== null && (variant as ApiDocsJsonSchema).type === "null"),
    );
    return exampleFromSchema((nonNull ?? variants[0]) as ApiDocsJsonSchema, schemas, depth + 1);
  }
  if (Array.isArray(resolved.allOf) || resolved.properties) {
    const result: Record<string, unknown> = {};
    for (const property of schemaProperties(resolved, schemas)) {
      result[property.name] = exampleFromSchema(property.schema, schemas, depth + 1);
    }
    return result;
  }
  const type = Array.isArray(resolved.type)
    ? resolved.type.find((t) => t !== "null")
    : resolved.type;
  switch (type) {
    case "string": {
      const format = resolved.format;
      if (format === "uuid") return "123e4567-e89b-12d3-a456-426614174000";
      if (format === "date-time") return "2026-01-01T00:00:00.000Z";
      if (format === "date") return "2026-01-01";
      if (format === "email") return "user@example.com";
      if (format === "uri" || format === "url") return "https://example.com";
      return "string";
    }
    case "integer":
      return 1;
    case "number":
      return 1.5;
    case "boolean":
      return true;
    case "array":
      return [exampleFromSchema(resolved.items as ApiDocsJsonSchema, schemas, depth + 1)];
    case "null":
      return null;
    case "object":
      return {};
    default:
      return null;
  }
}
