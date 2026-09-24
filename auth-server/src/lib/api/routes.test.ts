import { describe, expect, mock, test } from "bun:test";
import { Glob } from "bun";
import { existsSync } from "node:fs";
import path from "node:path";

// The operation modules import the `server-only` marker, which throws
// outside a React Server Components bundle; stub it so the definitions can
// be loaded under `bun test`.
mock.module("server-only", () => ({}));

const APP_DIR = path.resolve(import.meta.dir, "../../app");
const API_DIR = path.join(APP_DIR, "api");

/** `api/apps/[app_id]/domains` → `/api/apps/{app_id}/domains`. */
function nextRouteDirToOpenApiPath(routeDir: string): string {
  const segments = routeDir
    .split("/")
    .filter((segment) => segment.length > 0 && !/^\(.*\)$/.test(segment)) // drop route groups
    .map((segment) => segment.replace(/^\[([^\]]+)\]$/, "{$1}"));
  return `/${segments.join("/")}`;
}

/** `/api/apps/{app_id}/domains` → `api/apps/[app_id]/domains`. */
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

function isOperationLike(value: unknown): value is { operationId: string; path: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { operationId?: unknown }).operationId === "string" &&
    typeof (value as { path?: unknown }).path === "string"
  );
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
      expect(documentedPaths.has(openApiPath), `${routeDir}/route.ts is not in src/lib/api/operations/`).toBe(true);
    }
  });

  test("each operation.ts beside a route file only exports catalogued operations", async () => {
    const { operations } = await import("./operations");
    const catalogued = new Set(operations);
    const glob = new Glob("**/operation.ts");
    const operationFiles = Array.from(glob.scanSync({ cwd: API_DIR })).sort();
    expect(operationFiles.length).toBeGreaterThan(0);

    for (const file of operationFiles) {
      const routeDir = path.dirname(file);
      expect(existsSync(path.join(API_DIR, routeDir, "route.ts")), `${file} has no route.ts beside it`).toBe(true);
      const loaded = (await import(path.join(API_DIR, file))) as Record<string, unknown>;
      const exported = Object.values(loaded).filter(isOperationLike);
      expect(exported.length, `${file} exports no operations`).toBeGreaterThan(0);
      for (const operation of exported) {
        expect(catalogued.has(operation as (typeof operations)[number]), `${operation.operationId} (${file}) is not in src/lib/api/operations/`).toBe(true);
        expect(operation.path, `${operation.operationId} lives in the wrong folder`).toBe(nextRouteDirToOpenApiPath(`api/${routeDir}`));
      }
    }
  });

  test("the generated document lists exactly the catalogued paths", async () => {
    const { operations } = await import("./operations");
    const { getOpenApiDocument } = await import("./openapi-document");
    const catalogued = Array.from(new Set(operations.map((op) => op.path))).sort();
    expect(Object.keys(getOpenApiDocument().paths ?? {}).sort()).toEqual(catalogued);
  });

  test("every operation carries exactly one known tag", async () => {
    const { operations } = await import("./operations");
    const { API_TAG_DESCRIPTIONS } = await import("./tags");
    const known = new Set(API_TAG_DESCRIPTIONS.map((tag) => tag.name));
    for (const operation of operations) {
      expect(operation.tags.length, `${operation.operationId} tags`).toBe(1);
      expect(known.has(operation.tags[0] as never), `${operation.operationId} tag ${operation.tags[0]}`).toBe(true);
    }
  });
});
