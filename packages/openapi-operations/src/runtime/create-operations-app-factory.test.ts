import { describe, expect, test } from "bun:test";
import { z } from "../zod-openapi";
import { createOperationDefiner, operationHttpMethods } from "../operation";
import { publicAccess, requireAuth, schemaVaultsAccessTokenBearerScheme } from "../auth-scheme";
import { createOperationsAppFactory } from "./create-operations-app-factory";
import type { AuthResolvers } from "./resolve-auth";
import { toNextRouteHandlers } from "../adapters/nextjs";
import { buildOpenApiDocument } from "../openapi/build-openapi-document";

interface User {
  uid: string;
}
interface Ctx {
  now: number;
}

const define = createOperationDefiner<Ctx, User>();

const health = define({
  method: "get",
  path: "/api/health",
  summary: "Health",
  auth: publicAccess(),
  responses: { 200: { description: "ok", schema: z.object({ now: z.number() }) } },
  handler: (ctx) => ctx.json(200, { now: ctx.context.now }),
});

const listItems = define({
  method: "get",
  path: "/api/items",
  summary: "List items",
  auth: requireAuth({ schemes: [schemaVaultsAccessTokenBearerScheme] }),
  responses: { 200: { description: "ok", schema: z.object({ uid: z.string() }) } },
  handler: (ctx) => ctx.json(200, { uid: ctx.auth.user?.uid ?? "" }),
});

const createItem = define({
  method: "post",
  path: "/api/items",
  summary: "Create item",
  auth: requireAuth({ schemes: [schemaVaultsAccessTokenBearerScheme] }),
  request: { body: { schema: z.object({ name: z.string() }) } },
  responses: { 201: { description: "created", schema: z.object({ name: z.string() }) } },
  handler: (ctx) => ctx.json(201, { name: ctx.body.name }),
});

const unlisted = define({
  method: "get",
  path: "/api/unlisted",
  summary: "Not in the catalogue",
  auth: publicAccess(),
  responses: { 200: { description: "ok", schema: z.object({}) } },
  handler: (ctx) => ctx.json(200, {}),
});

const operations = [health, listItems, createItem];

const authResolvers: AuthResolvers<User> = {
  "schemavaults-access-token": (c) => {
    const header = c.req.header("authorization");
    if (!header?.startsWith("Bearer ")) return null;
    return { scheme: "schemavaults-access-token", user: { uid: header.slice(7) }, isAdmin: false, scope: null };
  },
};

const document = buildOpenApiDocument({ info: { title: "t", version: "1" }, operations });
const api = createOperationsAppFactory<Ctx, User>({
  operations,
  authResolvers,
  context: () => ({ now: 7 }),
});

describe("createOperationsAppFactory", () => {
  test("exposes the frozen catalogue", () => {
    expect(api.operations).toEqual(operations);
    expect(Object.isFrozen(api.operations)).toBe(true);
  });

  test("builds an app per route serving only its operations", async () => {
    const healthApp = api.app([health]);
    expect((await healthApp.request("/api/health")).status).toBe(200);
    expect(await (await healthApp.request("/api/health")).json()).toEqual({ now: 7 });
    expect((await healthApp.request("/api/items")).status).toBe(404);

    const itemsApp = api.app([listItems, createItem]);
    expect((await itemsApp.request("/api/health")).status).toBe(404);
    expect((await itemsApp.request("/api/items")).status).toBe(401);
    const listed = await itemsApp.request("/api/items", { headers: { authorization: "Bearer alice" } });
    expect(await listed.json()).toEqual({ uid: "alice" });
    const created = await itemsApp.request("/api/items", {
      method: "POST",
      headers: { authorization: "Bearer alice", "content-type": "application/json" },
      body: JSON.stringify({ name: "x" }),
    });
    expect(created.status).toBe(201);
  });

  test("defaults to the whole catalogue", async () => {
    const all = api.app();
    expect((await all.request("/api/health")).status).toBe(200);
    expect((await all.request("/api/items", { headers: { authorization: "Bearer a" } })).status).toBe(200);
  });

  test("refuses operations outside the catalogue", () => {
    expect(() => api.app([unlisted])).toThrow(/not part of the operations catalogue/);
    expect(() => api.assertRegistered([health, unlisted])).toThrow(/GET \/api\/unlisted/);
    expect(() => api.assertRegistered([health])).not.toThrow();
  });

  test("serves the OpenAPI document from its own app", async () => {
    const docApp = api.openApiDocumentApp({ path: "/api/openapi.json", document });
    const res = await docApp.request("/api/openapi.json");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { paths: Record<string, unknown> };
    expect(Object.keys(body.paths).sort()).toEqual(["/api/health", "/api/items"]);
    expect((await docApp.request("/api/health")).status).toBe(404);
  });

  test("validates the whole catalogue up front", () => {
    expect(() =>
      createOperationsAppFactory<Ctx, User>({ operations: [health, listItems], authResolvers: {} }),
    ).toThrow(/no resolver was registered/);
    expect(() =>
      createOperationsAppFactory<Ctx, User>({ operations: [health, health] }),
    ).toThrow(/Duplicate operationId/);
  });

  test("operationHttpMethods drives the exported Next.js handlers", async () => {
    expect(operationHttpMethods([health])).toEqual(["get"]);
    expect(operationHttpMethods([listItems, createItem])).toEqual(["get", "post"]);
    expect(operationHttpMethods([createItem, listItems, createItem])).toEqual(["post", "get"]);

    const handlers = toNextRouteHandlers(api.app([health]), operationHttpMethods([health]));
    expect(Object.keys(handlers)).toEqual(["GET"]);
    const res = await handlers.GET(new Request("http://localhost/api/health"));
    expect(await res.json()).toEqual({ now: 7 });
  });
});
