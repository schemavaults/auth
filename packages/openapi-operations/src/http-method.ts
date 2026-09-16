/**
 * HTTP methods an operation can be declared with. Lower-case to match the
 * OpenAPI `paths` object keys; adapters upper-case them for routing.
 */
export const HTTP_METHODS = [
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "head",
  "options",
] as const;

export type HttpMethod = (typeof HTTP_METHODS)[number];

export function isHttpMethod(value: unknown): value is HttpMethod {
  return (
    typeof value === "string" &&
    (HTTP_METHODS as readonly string[]).includes(value)
  );
}

export const HTTP_METHODS_WITH_REQUEST_BODY: ReadonlySet<HttpMethod> = new Set<HttpMethod>([
  "post",
  "put",
  "patch",
  "delete",
]);
