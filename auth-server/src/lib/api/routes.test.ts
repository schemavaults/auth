import { describe, expect, mock, test } from "bun:test";
import path from "node:path";
import { checkNextAppRouterRoutes } from "@schemavaults/openapi-operations/nextjs/app-router-routes";

// The operation modules import the `server-only` marker, which throws
// outside a React Server Components bundle; stub it so the definitions can
// be loaded under `bun test`.
mock.module("server-only", () => ({}));

const APP_DIR = path.resolve(import.meta.dir, "../../app");

describe("per-route handlers and the single OpenAPI document stay in sync", () => {
  test("every operation.ts beside a route.ts under src/app/api matches the catalogue", async () => {
    const { operations } = await import("./operations");
    const { OPENAPI_DOCUMENT_PATH } = await import("./openapi-document");
    // Every catalogued operation is exported from the operation.ts of the
    // folder whose Next.js path it declares, beside a route.ts; every
    // route.ts serves a catalogued path (or the OpenAPI document).
    const report = await checkNextAppRouterRoutes({
      operations,
      appDirectory: APP_DIR,
      operationFileNames: ["operation.ts"],
      ignoredRoutePaths: [OPENAPI_DOCUMENT_PATH],
      catalogueLabel: "src/lib/api/operations/",
    });
    expect(report.problems).toEqual([]);
    expect(report.operationFiles.length).toBeGreaterThan(0);
    expect(report.routeFiles.length).toBe(report.operationFiles.length + 1);
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
