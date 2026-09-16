import type { ApiDocsHttpMethod, ApiDocsModel, ApiDocsOperation } from "./types";

/**
 * Stable, URL-safe slug for an operation, e.g.
 * `GET /api/apps/{app_id}` → `get-api-apps-app_id`. Uniqueness across a
 * document is guaranteed by `parseOpenApiDocument` (it suffixes collisions).
 */
export function operationSlug(method: ApiDocsHttpMethod | string, path: string): string {
  const pathPart = path
    .replace(/[{}]/g, "")
    .split("/")
    .filter((segment) => segment.length > 0)
    .map((segment) => segment.toLowerCase().replace(/[^a-z0-9_.~-]+/g, "-"))
    .join("-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  const methodPart = method.toLowerCase();
  return pathPart.length > 0 ? `${methodPart}-${pathPart}` : `${methodPart}-root`;
}

export function findOperationBySlug(
  model: Pick<ApiDocsModel, "operations">,
  slug: string,
): ApiDocsOperation | null {
  return model.operations.find((operation) => operation.slug === slug) ?? null;
}

/** Path of an operation's docs page under `basePath` (no trailing slash handling needed). */
export function operationDocsHref(basePath: string, operation: Pick<ApiDocsOperation, "slug">): string {
  const base = basePath.replace(/\/+$/, "");
  return `${base}/${operation.slug}`;
}
