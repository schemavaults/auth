import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assertNextAppRouterRoutes,
  checkNextAppRouterRoutes,
  nextRouteDirectoryToOpenApiPath,
  openApiPathToNextRouteDirectory,
} from "./app-router-routes";
import { z } from "../zod-openapi";
import { defineOperation, type AnyOperationDefinition } from "../operation";
import { publicAccess } from "../auth-scheme";

const ok = { 200: { description: "ok", schema: z.object({ ok: z.boolean() }) } } as const;
function op(method: "get" | "post", path: string, params?: string[]) {
  return defineOperation({
    method,
    path,
    summary: `${method} ${path}`,
    auth: publicAccess(),
    ...(params ? { request: { params: z.object(Object.fromEntries(params.map((p) => [p, z.string()]))) } } : {}),
    responses: ok,
    handler: (ctx) => ctx.json(200, { ok: true }),
  });
}

const health = op("get", "/api/health");
const getItem = op("get", "/api/items/{id}", ["id"]);
const createItem = op("post", "/api/items");
const orphan = op("get", "/api/orphan");
const misplaced = op("get", "/api/elsewhere");

// The "file system" is a temp directory with empty marker files; the
// modules are supplied through importModule so no real TS is compiled.
let appDir: string;
const modules = new Map<string, Record<string, unknown>>();
function file(relativePath: string, exports?: Record<string, unknown>): void {
  const full = join(appDir, relativePath);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, "");
  if (exports) modules.set(full, exports);
}
const importModule = async (path: string): Promise<Record<string, unknown>> => {
  const mod = modules.get(path);
  if (!mod) throw new Error(`boom: ${path}`);
  return mod;
};

beforeAll(() => {
  appDir = mkdtempSync(join(tmpdir(), "app-router-routes-"));
  file("api/health/route.ts");
  file("api/health/operation.ts", { health });
  file("api/items/route.ts");
  file("api/items/operation.ts", { createItem, helper: () => 1 });
  file("api/(admin)/items/[id]/route.ts");
  file("api/(admin)/items/[id]/operation.ts", { getItem });
  file("api/openapi.json/route.ts");
  file("api/_private/route.ts");
});

afterAll(() => {
  rmSync(appDir, { recursive: true, force: true });
});

const base = {
  appDirectory: () => appDir,
  importModule,
  ignoredRoutePaths: ["/api/openapi.json"],
  catalogueLabel: "src/lib/api/operations.ts",
};

async function check(operations: readonly AnyOperationDefinition[], extra: Record<string, unknown> = {}) {
  return checkNextAppRouterRoutes({ ...base, appDirectory: appDir, operations, ...extra });
}

describe("path conversion", () => {
  test("directories map to OpenAPI paths and back", () => {
    expect(nextRouteDirectoryToOpenApiPath("api/(admin)/items/[id]")).toBe("/api/items/{id}");
    expect(nextRouteDirectoryToOpenApiPath("api\\items\\[id]")).toBe("/api/items/{id}");
    expect(nextRouteDirectoryToOpenApiPath("api/files/[...path]")).toBeNull();
    expect(nextRouteDirectoryToOpenApiPath("api/files/[[...path]]")).toBeNull();
    expect(openApiPathToNextRouteDirectory("/api/items/{id}/tags")).toBe("api/items/[id]/tags");
  });
});

describe("checkNextAppRouterRoutes", () => {
  test("a consistent layout has no problems", async () => {
    const report = await check([health, getItem, createItem]);
    expect(report.problems).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.operationFiles.map((f) => f.replace(appDir, ""))).toEqual([
      "/api/(admin)/items/[id]/operation.ts",
      "/api/health/operation.ts",
      "/api/items/operation.ts",
    ]);
    // _private folders are never routes; the ignored openapi.json route needs no operation file
    expect(report.routeFiles.some((f) => f.includes("_private"))).toBe(false);
    await expect(assertNextAppRouterRoutes({ ...base, appDirectory: appDir, operations: [health, getItem, createItem] })).resolves.toMatchObject({ ok: true });
  });

  test("reports catalogue entries without a file and exports missing from the catalogue", async () => {
    const report = await check([health, getItem, orphan]);
    expect(report.ok).toBe(false);
    expect(report.problems).toHaveLength(3);
    expect(report.problems[0]).toMatch(/items\/operation\.ts: export 'createItem' \(post_api_items\) is not listed in src\/lib\/api\/operations\.ts/);
    expect(report.problems[1]).toMatch(/src\/lib\/api\/operations\.ts: 'get_api_orphan' \(GET \/api\/orphan\) is not exported by any operation\.ts \/ operations\.ts/);
    expect(report.problems[2]).toMatch(/items\/route\.ts: serves '\/api\/items', which is not in src\/lib\/api\/operations\.ts/);
    await expect(assertNextAppRouterRoutes({ ...base, appDirectory: appDir, operations: [health, getItem, orphan] })).rejects.toThrow(/disagree:\n {2}- /);
  });

  test("reports a path that does not match the directory, and a route file with no catalogued path", async () => {
    file("api/wrong/route.ts");
    file("api/wrong/operation.ts", { misplaced });
    try {
      const report = await check([health, getItem, createItem, misplaced]);
      expect(report.problems).toEqual([
        expect.stringMatching(/wrong\/operation\.ts: export 'misplaced' \(get_api_elsewhere\) declares path '\/api\/elsewhere' but its directory maps to '\/api\/wrong'/),
        expect.stringMatching(/wrong\/route\.ts: serves '\/api\/wrong', which is not in src\/lib\/api\/operations\.ts/),
      ]);
    } finally {
      rmSync(join(appDir, "api/wrong"), { recursive: true, force: true });
    }
  });

  test("reports files without a route.ts, without operations, that fail to import, and duplicates", async () => {
    const duplicate = op("get", "/api/health");
    file("api/lonely/operation.ts", { lonely: op("get", "/api/lonely") });
    file("api/empty/route.ts");
    file("api/empty/operation.ts", { nothing: 1 });
    file("api/broken/route.ts");
    file("api/broken/operation.ts");
    file("api/twice/route.ts");
    file("api/twice/operation.ts", { duplicate });
    try {
      const report = await check([health, getItem, createItem]);
      expect(report.problems).toEqual([
        expect.stringMatching(/broken\/operation\.ts: failed to import \(boom/),
        expect.stringMatching(/empty\/operation\.ts: exports no operations/),
        expect.stringMatching(/lonely\/operation\.ts: no sibling route\.ts/),
        expect.stringMatching(/lonely\/operation\.ts: export 'lonely' \(get_api_lonely\) is not listed/),
        expect.stringMatching(/twice\/operation\.ts: export 'duplicate' \(get_api_health\) declares path '\/api\/health' but its directory maps to '\/api\/twice'/),
        expect.stringMatching(/twice\/operation\.ts: export 'duplicate' \(get_api_health\) is a different object from the 'get_api_health' listed/),
        expect.stringMatching(/broken\/route\.ts: serves '\/api\/broken', which is not in/),
        expect.stringMatching(/empty\/route\.ts: serves '\/api\/empty', which is not in/),
        expect.stringMatching(/twice\/route\.ts: serves '\/api\/twice', which is not in/),
      ]);
    } finally {
      for (const dir of ["lonely", "empty", "broken", "twice"]) rmSync(join(appDir, "api", dir), { recursive: true, force: true });
    }
  });

  test("rejects catch-all segments unless the directory is ignored", async () => {
    file("api/files/[...path]/route.ts");
    file("api/files/[...path]/operation.ts", { health });
    try {
      const report = await check([health, getItem, createItem]);
      expect(report.problems).toEqual([
        expect.stringMatching(/\[\.\.\.path\]\/operation\.ts: catch-all segments cannot be described/),
        expect.stringMatching(/\[\.\.\.path\]\/route\.ts: catch-all route files cannot serve/),
      ]);
      const ignored = await check([health, getItem, createItem], { ignoredRouteDirectories: ["api/files/[...path]"] });
      expect(ignored.problems).toEqual([]);
    } finally {
      rmSync(join(appDir, "api/files"), { recursive: true, force: true });
    }
  });

  test("reports a duplicate catalogue and a missing api directory", async () => {
    const report = await check([health, health], { apiDirectory: "nope" });
    expect(report.problems).toEqual([
      expect.stringMatching(/src\/lib\/api\/operations\.ts: Duplicate operationId "get_api_health"/),
      expect.stringMatching(/API directory .*nope does not exist/),
      expect.stringMatching(/'get_api_health' \(GET \/api\/health\) is not exported by any/),
    ]);
  });

  test("the default importModule loads real modules", async () => {
    const dir = mkdtempSync(join(tmpdir(), "app-router-routes-real-"));
    try {
      mkdirSync(join(dir, "api/ping"), { recursive: true });
      writeFileSync(join(dir, "api/ping/route.ts"), "export const GET = () => new Response('pong');\n");
      writeFileSync(
        join(dir, "api/ping/operation.ts"),
        `export const ping = { method: "get", path: "/api/ping", operationId: "get_api_ping", handler: () => new Response("pong") };\n`,
      );
      const report = await checkNextAppRouterRoutes({ appDirectory: dir, operations: [] });
      // Loaded fine (no import failure); the only problem is that it is not catalogued.
      expect(report.problems).toEqual([
        expect.stringMatching(/ping\/operation\.ts: export 'ping' \(get_api_ping\) is not listed in the operations catalogue/),
        expect.stringMatching(/ping\/route\.ts: serves '\/api\/ping', which is not in the operations catalogue/),
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
