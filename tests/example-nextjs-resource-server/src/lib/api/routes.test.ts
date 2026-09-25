import { describe, expect, mock, test } from "bun:test";
import path from "node:path";
import { checkNextAppRouterRoutes } from "@schemavaults/openapi-operations/nextjs/app-router-routes";

// The operation modules (via ./context) import the `server-only` marker,
// which throws outside a React Server Components bundle; stub it so the
// definitions can be loaded under `bun test`.
mock.module("server-only", () => ({}));

const APP_DIR = path.resolve(import.meta.dir, "../../app");

describe("per-route handlers and the single OpenAPI document stay in sync", () => {
  test("every operation.ts beside a route.ts under src/app/api matches the catalogue", async () => {
    const { operations } = await import("./operations");
    const { OPENAPI_DOCUMENT_PATH } = await import("./openapi-document");
    const report = await checkNextAppRouterRoutes({
      operations,
      appDirectory: APP_DIR,
      operationFileNames: ["operation.ts"],
      // Served by its own route file, not an operation.
      ignoredRoutePaths: [OPENAPI_DOCUMENT_PATH],
      catalogueLabel: "src/lib/api/operations.ts",
    });
    expect(report.problems).toEqual([]);
    expect(report.operationFiles.length).toBe(operations.length);
    expect(report.routeFiles.length).toBe(operations.length + 1);
  });

  test("the generated document lists exactly the catalogued paths", async () => {
    const { operations } = await import("./operations");
    const { openApiDocument } = await import("./openapi-document");
    const catalogued = Array.from(new Set(operations.map((op) => op.path))).sort();
    expect(Object.keys(openApiDocument.paths ?? {}).sort()).toEqual(catalogued);
  });

  test("the document describes the runtime's own error responses", async () => {
    const { openApiDocument } = await import("./openapi-document");
    expect(openApiDocument.components?.schemas?.OperationError).toBeDefined();
    const whoami = openApiDocument.paths?.["/api/whoami"]?.get?.responses ?? {};
    expect(Object.keys(whoami)).toContain("401");
    expect(Object.keys(whoami)).toContain("500");
  });
});
