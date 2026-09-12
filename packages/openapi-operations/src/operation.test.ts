import { describe, expect, test } from "bun:test";
import { z } from "./zod";
import {
  assertUniqueOperations,
  createOperationDefiner,
  defaultOperationId,
  defineOperation,
  defineOperationGroup,
} from "./operation";
import { publicAccess, requireAuth, schemaVaultsAccessTokenBearerScheme } from "./auth-scheme";

const okResponse = { 200: { description: "ok", schema: z.object({ ok: z.boolean() }) } } as const;

describe("defineOperation", () => {
  test("fills defaults", () => {
    const op = defineOperation({
      method: "get",
      path: "/api/health",
      summary: "Health",
      auth: publicAccess(),
      responses: okResponse,
      handler: (ctx) => ctx.json(200, { ok: true }),
    });
    expect(op.operationId).toBe("get_api_health");
    expect(op.tags).toEqual([]);
    expect(op.request).toEqual({});
    expect(Object.isFrozen(op)).toBe(true);
  });

  test("rejects undeclared path params", () => {
    expect(() =>
      defineOperation({
        method: "get",
        path: "/api/apps/{app_id}",
        summary: "x",
        auth: publicAccess(),
        responses: okResponse,
        handler: (ctx) => ctx.json(200, { ok: true }),
      }),
    ).toThrow(/not declared in request.params/);
  });

  test("rejects params without placeholders", () => {
    expect(() =>
      defineOperation({
        method: "get",
        path: "/api/apps",
        summary: "x",
        auth: publicAccess(),
        request: { params: z.object({ app_id: z.string() }) },
        responses: okResponse,
        handler: (ctx) => ctx.json(200, { ok: true }),
      }),
    ).toThrow(/has no \{app_id\} placeholder/);
  });

  test("rejects a body on GET", () => {
    expect(() =>
      defineOperation({
        method: "get",
        path: "/api/apps",
        summary: "x",
        auth: publicAccess(),
        request: { body: { schema: z.object({}) } },
        responses: okResponse,
        handler: (ctx) => ctx.json(200, { ok: true }),
      }),
    ).toThrow(/declares a request body/);
  });

  test("rejects express-style paths and empty responses", () => {
    expect(() =>
      defineOperation({
        method: "get",
        path: "/api/apps/:app_id",
        summary: "x",
        auth: publicAccess(),
        responses: okResponse,
        handler: (ctx) => ctx.json(200, { ok: true }),
      }),
    ).toThrow(/placeholders/);
    expect(() =>
      defineOperation({
        method: "get",
        path: "/api/apps",
        summary: "x",
        auth: publicAccess(),
        responses: {},
        handler: () => new Response(null),
      }),
    ).toThrow(/declares no responses/);
  });

  test("createOperationDefiner threads the context type", async () => {
    const define = createOperationDefiner<{ greeting: string }, { uid: string }>();
    const op = define({
      method: "get",
      path: "/hello/{name}",
      summary: "Hello",
      auth: requireAuth({ schemes: [schemaVaultsAccessTokenBearerScheme] }),
      request: { params: z.object({ name: z.string() }) },
      responses: { 200: { description: "ok", schema: z.object({ message: z.string() }) } },
      handler: (ctx) =>
        ctx.json(200, {
          message: `${ctx.context.greeting} ${ctx.params.name} from ${ctx.auth.user?.uid ?? "?"}`,
        }),
    });
    expect(op.auth.type).toBe("required");
    expect(op.operationId).toBe("get_hello_name");
  });
});

describe("defaultOperationId", () => {
  test("slugifies", () => {
    expect(defaultOperationId("post", "/api/orgs/{organization_id}/members")).toBe(
      "post_api_orgs_organization_id_members",
    );
    expect(defaultOperationId("get", "/")).toBe("get");
  });
});

describe("defineOperationGroup", () => {
  const inner = defineOperation({
    method: "get",
    path: "/list",
    summary: "List",
    tags: ["own"],
    auth: publicAccess(),
    responses: okResponse,
    handler: (ctx) => ctx.json(200, { ok: true }),
  });

  test("applies prefix and tags", () => {
    const [op] = defineOperationGroup({ pathPrefix: "/api/apps/", tags: ["apps"], operations: [inner] });
    expect(op?.path).toBe("/api/apps/list");
    expect(op?.tags).toEqual(["apps", "own"]);
  });

  test("assertUniqueOperations detects duplicates", () => {
    expect(() => assertUniqueOperations([inner, inner])).toThrow(/Duplicate operationId/);
    const clone = { ...inner, operationId: "other" };
    expect(() => assertUniqueOperations([inner, clone])).toThrow(/Duplicate route/);
  });
});
