import { describe, expect, mock, test } from "bun:test";
import { Glob } from "bun";
import { existsSync } from "node:fs";
import path from "node:path";

// The operation modules (via ./context) import the `server-only` marker,
// which throws outside a React Server Components bundle; stub it so the
// definitions can be loaded under `bun test`.
mock.module("server-only", () => ({}));

const APP_DIR = path.resolve(import.meta.dir, "../../app");

/** `api/organizations/[organization_id]/greeting` → `/api/organizations/{organization_id}/greeting`. */
function nextRouteDirToOpenApiPath(routeDir: string): string {
  const segments = routeDir
    .split("/")
    .filter((segment) => segment.length > 0 && !/^\(.*\)$/.test(segment)) // drop route groups
    .map((segment) => segment.replace(/^\[([^\]]+)\]$/, "{$1}"));
  return `/${segments.join("/")}`;
}

/** `/api/organizations/{organization_id}/greeting` → `api/organizations/[organization_id]/greeting`. */
function openApiPathToNextRouteDir(openApiPath: string): string {
  return openApiPath
    .split("/")
    .filter((segment) => segment.length > 0)
    .map((segment) => segment.replace(/^\{([^}]+)\}$/, "[$1]"))
    .join("/");
}

function listNextApiRouteDirs(): string[] {
  const glob = new Glob("api/**/route.ts");
  return Array.from(glob.scanSync({ cwd: APP_DIR }))
    .map((file) => path.dirname(file))
    .sort();
}

describe("per-route handlers and the single OpenAPI document stay in sync", () => {
  test("every catalogued operation has a route.ts at its Next.js path", async () => {
    const { operations } = await import("./operations");
    const { OPENAPI_DOCUMENT_PATH } = await import("./openapi-document");
    const documentedPaths = new Set([...operations.map((op) => op.path), OPENAPI_DOCUMENT_PATH]);
    expect(documentedPaths.size).toBeGreaterThan(1);

    for (const openApiPath of documentedPaths) {
      const routeFile = path.join(APP_DIR, openApiPathToNextRouteDir(openApiPath), "route.ts");
      expect(existsSync(routeFile), `${openApiPath} needs ${path.relative(APP_DIR, routeFile)}`).toBe(true);
    }
  });

  test("every route.ts under src/app/api serves a catalogued path", async () => {
    const { operations } = await import("./operations");
    const { OPENAPI_DOCUMENT_PATH } = await import("./openapi-document");
    const documentedPaths = new Set([...operations.map((op) => op.path), OPENAPI_DOCUMENT_PATH]);

    const routeDirs = listNextApiRouteDirs();
    expect(routeDirs.length).toBeGreaterThan(0);
    for (const routeDir of routeDirs) {
      const openApiPath = nextRouteDirToOpenApiPath(routeDir);
      expect(documentedPaths.has(openApiPath), `${routeDir}/route.ts is not in src/lib/api/operations.ts`).toBe(true);
    }
  });

  test("each operation's folder declares it beside the route file", async () => {
    const { operations } = await import("./operations");
    for (const operation of operations) {
      const operationFile = path.join(APP_DIR, openApiPathToNextRouteDir(operation.path), "operation.ts");
      expect(existsSync(operationFile), `${operation.operationId} should live in ${operationFile}`).toBe(true);
    }
  });

  test("the generated document lists exactly the catalogued paths", async () => {
    const { operations } = await import("./operations");
    const { openApiDocument } = await import("./openapi-document");
    const catalogued = Array.from(new Set(operations.map((op) => op.path))).sort();
    expect(Object.keys(openApiDocument.paths ?? {}).sort()).toEqual(catalogued);
  });
});
