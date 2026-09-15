const OPENAPI_PATH_PARAM_REGEX = /\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

export function isOpenApiPath(path: string): boolean {
  return (
    typeof path === "string" &&
    path.startsWith("/") &&
    !path.includes(":") &&
    !/\{[^}]*[^A-Za-z0-9_}][^}]*\}/.test(path)
  );
}

/** Names of the `{placeholders}` in an OpenAPI path, in order. */
export function extractPathParameterNames(path: string): string[] {
  const names: string[] = [];
  for (const match of path.matchAll(OPENAPI_PATH_PARAM_REGEX)) {
    const name = match[1];
    if (typeof name === "string") names.push(name);
  }
  return names;
}

/** `/api/apps/{app_id}` → `/api/apps/:app_id` (Hono / Express style). */
export function openApiPathToHonoPath(path: string): string {
  return path.replace(OPENAPI_PATH_PARAM_REGEX, ":$1");
}

/** `/api/apps/:app_id` → `/api/apps/{app_id}`. */
export function honoPathToOpenApiPath(path: string): string {
  return path.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, "{$1}");
}
