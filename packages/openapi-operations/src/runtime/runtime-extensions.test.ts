import { describe, expect, test } from "bun:test";
import { z } from "../zod-openapi";
import { createOperationDefiner } from "../operation";
import { publicAccess, requireAuth, apiKeyHeaderScheme } from "../auth-scheme";
import { createOperationsApp } from "./create-operations-app";
import { OperationError } from "./errors";
import type { AuthResolvers } from "./resolve-auth";
import { buildOpenApiDocument } from "../openapi/build-openapi-document";

interface Ctx {
  id: number;
  disposed: boolean;
}
interface User {
  uid: string;
}

const define = createOperationDefiner<Ctx, User>();
const key = apiKeyHeaderScheme("api-key", "X-Api-Key");

const created: Ctx[] = [];
const failures: { message: string; operationId: string; contextId: number | undefined }[] = [];

const lenientJson = define({
  method: "post",
  path: "/api/lenient",
  summary: "Lenient JSON",
  auth: publicAccess(),
  request: { body: { schema: z.object({ name: z.string().min(1) }), lenientContentType: true } },
  responses: { 200: { description: "ok", schema: z.object({ name: z.string() }) } },
  handler: (ctx) => ctx.json(200, { name: ctx.body.name }),
});

const strictJson = define({
  method: "post",
  path: "/api/strict",
  summary: "Strict JSON",
  auth: publicAccess(),
  request: { body: { schema: z.object({ name: z.string() }) } },
  responses: { 200: { description: "ok", schema: z.object({ name: z.string() }) } },
  handler: (ctx) => ctx.json(200, { name: ctx.body.name }),
});

const lenientForm = define({
  method: "post",
  path: "/api/lenient-form",
  summary: "Lenient form",
  auth: publicAccess(),
  request: {
    body: {
      contentType: "application/x-www-form-urlencoded",
      schema: z.object({ grant_type: z.string() }),
      lenientContentType: true,
    },
  },
  responses: { 200: { description: "ok", schema: z.object({ grant_type: z.string() }) } },
  handler: (ctx) => ctx.json(200, { grant_type: ctx.body.grant_type }),
});

const documented = define({
  method: "post",
  path: "/api/document-only",
  summary: "Document-only body",
  auth: publicAccess(),
  request: {
    body: {
      schema: z.object({ anything: z.string() }),
      documentOnly: true,
      description: "Parsed by the handler itself",
    },
  },
  responses: { 200: { description: "ok", schema: z.object({ raw: z.string(), body: z.null() }) } },
  handler: async (ctx) => {
    const body: undefined = ctx.body; // typed as undefined
    return ctx.json(200, { raw: await ctx.request.text(), body: body ?? null });
  },
});

const whoami = define({
  method: "get",
  path: "/api/whoami",
  summary: "Who",
  auth: requireAuth({ schemes: [key] }),
  responses: { 200: { description: "ok", schema: z.object({ uid: z.string(), contextId: z.number() }) } },
  handler: (ctx) => ctx.json(200, { uid: ctx.auth.user?.uid ?? "", contextId: ctx.context.id }),
});

const boom = define({
  method: "get",
  path: "/api/boom",
  summary: "Throws",
  auth: publicAccess(),
  responses: { 200: { description: "never" } },
  handler: () => {
    throw new Error("kaboom");
  },
});

const authResolvers: AuthResolvers<User, Ctx> = {
  "api-key": (c, _scheme, context) => {
    const value = c.req.header("x-api-key");
    if (!value) return null;
    if (value === "bad") throw new OperationError(401, { error: "invalid_key", message: "nope" });
    // The resolver sees the same per-request context as the handler.
    return { scheme: "api-key", user: { uid: `user-of-ctx-${context.id}` }, isAdmin: false, scope: null };
  },
};

let nextId = 1;
const app = createOperationsApp<Ctx, User>({
  operations: [lenientJson, strictJson, lenientForm, documented, whoami, boom],
  authResolvers,
  context: () => {
    const ctx: Ctx = { id: nextId++, disposed: false };
    created.push(ctx);
    return ctx;
  },
  disposeContext: (ctx) => {
    ctx.disposed = true;
  },
  onError: (error, _c, info) => {
    failures.push({
      message: error instanceof Error ? error.message : String(error),
      operationId: info.operation.operationId,
      contextId: info.context?.id,
    });
  },
});

describe("lenientContentType", () => {
  test("parses text/plain JSON when lenient", async () => {
    const res = await app.request("/api/lenient", {
      method: "POST",
      headers: { "content-type": "text/plain;charset=UTF-8" },
      body: JSON.stringify({ name: "x" }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ name: "x" });
  });

  test("parses an unlabelled JSON body when lenient", async () => {
    const res = await app.request("/api/lenient", {
      method: "POST",
      headers: { "content-length": "12" },
      body: '{"name":"y"}',
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ name: "y" });
  });

  test("still validates and rejects malformed lenient bodies with 400", async () => {
    const invalid = await app.request("/api/lenient", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: JSON.stringify({ name: "" }),
    });
    expect(invalid.status).toBe(400);
    const malformed = await app.request("/api/lenient", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "{ not json",
    });
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toMatchObject({ error: "validation_error" });
  });

  test("other media types are still a 415, and strict operations refuse text/plain", async () => {
    const xml = await app.request("/api/lenient", {
      method: "POST",
      headers: { "content-type": "application/xml" },
      body: "<name/>",
    });
    expect(xml.status).toBe(415);
    const strict = await app.request("/api/strict", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: JSON.stringify({ name: "x" }),
    });
    expect(strict.status).toBe(415);
  });

  test("lenient form bodies", async () => {
    const res = await app.request("/api/lenient-form", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "grant_type=refresh_token",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ grant_type: "refresh_token" });
  });
});

describe("documentOnly bodies", () => {
  test("the runtime leaves the request body to the handler", async () => {
    const res = await app.request("/api/document-only", {
      method: "POST",
      headers: { "content-type": "application/xml" },
      body: "<not-json/>",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ raw: "<not-json/>", body: null });
  });

  test("the body still appears in the OpenAPI document", () => {
    const doc = buildOpenApiDocument({ info: { title: "t", version: "1" }, operations: [documented] });
    const op = doc.paths?.["/api/document-only"]?.post as {
      requestBody: { content: Record<string, unknown>; description: string };
    };
    expect(Object.keys(op.requestBody.content)).toEqual(["application/json"]);
    expect(op.requestBody.description).toBe("Parsed by the handler itself");
  });
});

describe("per-request context lifecycle", () => {
  test("resolvers receive the context and it is disposed after the response", async () => {
    const before = created.length;
    const res = await app.request("/api/whoami", { headers: { "x-api-key": "k" } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { uid: string; contextId: number };
    const ctx = created[before];
    expect(ctx).toBeDefined();
    expect(body.contextId).toBe(ctx!.id);
    expect(body.uid).toBe(`user-of-ctx-${ctx!.id}`);
    expect(ctx!.disposed).toBe(true);
  });

  test("the context is disposed when auth fails", async () => {
    const before = created.length;
    const res = await app.request("/api/whoami", { headers: { "x-api-key": "bad" } });
    expect(res.status).toBe(401);
    expect(created[before]?.disposed).toBe(true);
    const missing = await app.request("/api/whoami");
    expect(missing.status).toBe(401);
    expect(created[before + 1]?.disposed).toBe(true);
  });

  test("onError learns the operation and context; the context is still disposed", async () => {
    const before = created.length;
    const res = await app.request("/api/boom");
    expect(res.status).toBe(500);
    expect(failures.at(-1)).toEqual({
      message: "kaboom",
      operationId: boom.operationId,
      contextId: created[before]!.id,
    });
    expect(created[before]!.disposed).toBe(true);
  });
});

describe("withOpenApi", () => {
  test("attaches metadata to a schema that has no .openapi of its own", async () => {
    const { withOpenApi } = await import("../zod-openapi");
    // Simulate a schema built before the extension ran by stripping the copied method.
    const foreign = z.object({ id: z.string() });
    Object.defineProperty(foreign, "openapi", { value: undefined, configurable: true });
    expect(typeof (foreign as unknown as { openapi?: unknown }).openapi).toBe("undefined");
    const named = withOpenApi(foreign, "Foreign", { description: "A foreign schema" });
    expect(named).not.toBe(foreign);
    const doc = buildOpenApiDocument({
      info: { title: "t", version: "1" },
      operations: [
        define({
          method: "get",
          path: "/api/foreign",
          summary: "Foreign",
          auth: publicAccess(),
          responses: { 200: { description: "ok", schema: named } },
          handler: (ctx) => ctx.json(200, { id: "x" }),
        }),
      ],
    });
    expect(Object.keys(doc.components?.schemas ?? {})).toContain("Foreign");
    expect((doc.components?.schemas?.Foreign as { description?: string }).description).toBe("A foreign schema");
  });
});
