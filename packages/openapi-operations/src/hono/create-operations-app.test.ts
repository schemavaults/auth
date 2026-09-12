import { describe, expect, test } from "bun:test";
import { z } from "../zod";
import { createOperationDefiner, type AuthPrincipal } from "../operation";
import {
  publicAccess,
  requireAuth,
  schemaVaultsAccessTokenBearerScheme,
  apiKeyHeaderScheme,
} from "../auth-scheme";
import { createOperationsApp } from "./create-operations-app";
import { OperationError } from "./errors";
import type { AuthResolvers } from "./resolve-auth";
import { toNextRouteHandlers } from "../adapters/nextjs";
import { toVercelHandler } from "../adapters/vercel";
import { buildOpenApiDocument } from "../openapi/build-openapi-document";

interface User {
  uid: string;
  admin: boolean;
}
interface Ctx {
  now: number;
}

const define = createOperationDefiner<Ctx, User>();
const cronKey = apiKeyHeaderScheme("cron-key", "X-Cron-Key");

const health = define({
  method: "get",
  path: "/api/health",
  summary: "Health",
  auth: publicAccess(),
  responses: { 200: { description: "ok", schema: z.object({ ok: z.boolean(), now: z.number() }) } },
  handler: (ctx) => ctx.json(200, { ok: true, now: ctx.context.now }),
});

const getApp = define({
  method: "get",
  path: "/api/apps/{app_id}",
  summary: "Get app",
  auth: requireAuth({ schemes: [schemaVaultsAccessTokenBearerScheme, cronKey] }),
  request: {
    params: z.object({ app_id: z.string().uuid() }),
    query: z.object({ include: z.union([z.string(), z.array(z.string())]).optional(), page: z.coerce.number().int().min(1).default(1) }),
    headers: z.object({ "x-trace": z.string().optional() }),
  },
  responses: {
    200: { description: "App", schema: z.object({ app_id: z.string(), uid: z.string(), include: z.array(z.string()), page: z.number(), trace: z.string().nullable() }) },
    404: { description: "Missing", schema: z.object({ success: z.literal(false), message: z.string() }) },
  },
  handler: (ctx) => {
    if (ctx.params.app_id === "00000000-0000-0000-0000-000000000000") {
      return ctx.json(404, { success: false, message: "no such app" });
    }
    return ctx.json(200, {
      app_id: ctx.params.app_id,
      uid: ctx.auth.user?.uid ?? ctx.auth.clientId ?? "anonymous",
      include: ctx.query.include === undefined ? [] : ([] as string[]).concat(ctx.query.include),
      page: ctx.query.page,
      trace: ctx.headers["x-trace"] ?? null,
    });
  },
});

const createApp = define({
  method: "post",
  path: "/api/apps",
  summary: "Create app",
  auth: requireAuth({ schemes: [schemaVaultsAccessTokenBearerScheme], routeGuard: "admin" }),
  request: { body: { schema: z.object({ name: z.string().min(1) }) } },
  responses: { 201: { description: "Created", schema: z.object({ name: z.string() }) } },
  handler: (ctx) => ctx.json(201, { name: ctx.body.name }),
});

const scoped = define({
  method: "get",
  path: "/api/me/email",
  summary: "Email",
  auth: requireAuth({ schemes: [schemaVaultsAccessTokenBearerScheme], requiredScopes: ["email"] }),
  responses: { 200: { description: "ok", schema: z.object({ email: z.string() }) } },
  handler: (ctx) => ctx.json(200, { email: `${ctx.auth.user?.uid}@example.com` }),
});

const orgMembers = define({
  method: "get",
  path: "/api/organizations/{organization_id}/members",
  summary: "Members",
  auth: requireAuth({
    schemes: [schemaVaultsAccessTokenBearerScheme],
    organization: { parameter: "organization_id", roles: ["owner", "admin"] },
  }),
  request: { params: z.object({ organization_id: z.string() }) },
  responses: { 200: { description: "ok", schema: z.object({ members: z.array(z.string()) }) } },
  handler: (ctx) => ctx.json(200, { members: [] }),
});

const boom = define({
  method: "get",
  path: "/api/boom",
  summary: "Throws",
  auth: publicAccess(),
  request: { query: z.object({ kind: z.enum(["operation", "generic", "undeclared"]) }) },
  responses: { 200: { description: "never", schema: z.object({}) }, 418: { description: "teapot" } },
  handler: (ctx) => {
    if (ctx.query.kind === "operation") {
      throw new OperationError(418, { error: "teapot", message: "I am a teapot" });
    }
    if (ctx.query.kind === "undeclared") {
      return ctx.empty(418);
    }
    throw new Error("kaboom");
  },
});

const form = define({
  method: "post",
  path: "/api/form",
  summary: "Form",
  auth: publicAccess(),
  request: { body: { contentType: "application/x-www-form-urlencoded", schema: z.object({ grant_type: z.string() }) } },
  responses: { 200: { description: "ok", schema: z.object({ grant_type: z.string() }) } },
  handler: (ctx) => ctx.json(200, { grant_type: ctx.body.grant_type }),
});

const operations = [health, getApp, createApp, scoped, orgMembers, boom, form];

function principal(user: User, scope: string | null = null): AuthPrincipal<User> {
  return {
    scheme: "schemavaults-access-token",
    user,
    isAdmin: user.admin,
    scope,
    getOrganizationRole: async (organizationId) =>
      organizationId === "org-1" ? (user.admin ? "owner" : "member") : false,
  };
}

const authResolvers: AuthResolvers<User> = {
  "schemavaults-access-token": (c) => {
    const header = c.req.header("authorization");
    if (!header?.startsWith("Bearer ")) return null;
    const token = header.slice("Bearer ".length);
    if (token === "bad") {
      throw new OperationError(401, { error: "invalid_token", message: "Token rejected" });
    }
    const [uid, admin, scope] = token.split(":");
    return principal({ uid: uid ?? "u", admin: admin === "admin" }, scope ?? null);
  },
  "cron-key": (c) =>
    c.req.header("x-cron-key") === "secret"
      ? { scheme: "cron-key", user: null, isAdmin: true, scope: null, clientId: "cron" }
      : null,
};

const errors: unknown[] = [];
const document = buildOpenApiDocument({ info: { title: "t", version: "1" }, operations });
const app = createOperationsApp<Ctx, User>({
  operations,
  authResolvers,
  context: () => ({ now: 42 }),
  openapi: { document },
  onError: (error) => {
    errors.push(error);
  },
});

const APP_ID = "123e4567-e89b-12d3-a456-426614174000";

describe("createOperationsApp", () => {
  test("public operation with context", async () => {
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, now: 42 });
  });

  test("serves the OpenAPI document", async () => {
    const res = await app.request("/openapi.json");
    expect(res.status).toBe(200);
    const doc = (await res.json()) as { openapi: string; paths: Record<string, unknown> };
    expect(doc.openapi).toBe("3.1.0");
    expect(Object.keys(doc.paths)).toContain("/api/apps/{app_id}");
  });

  test("401 with challenge when no credential", async () => {
    const res = await app.request(`/api/apps/${APP_ID}`);
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toBe('Bearer realm="schemavaults"');
    expect(await res.json()).toEqual({ success: false, error: "unauthorized", message: "Authentication required" });
  });

  test("resolver may reject a presented credential", async () => {
    const res = await app.request(`/api/apps/${APP_ID}`, { headers: { authorization: "Bearer bad" } });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: "invalid_token" });
  });

  test("falls through to the next accepted scheme", async () => {
    const res = await app.request(`/api/apps/${APP_ID}`, { headers: { "x-cron-key": "secret" } });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ uid: "cron" });
  });

  test("validates params, query (arrays + coercion) and headers", async () => {
    const ok = await app.request(`/api/apps/${APP_ID}?include=a&include=b&page=3`, {
      headers: { authorization: "Bearer alice", "X-Trace": "t1" },
    });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ app_id: APP_ID, uid: "alice", include: ["a", "b"], page: 3, trace: "t1" });

    const bad = await app.request(`/api/apps/not-a-uuid?page=0`, { headers: { authorization: "Bearer alice" } });
    expect(bad.status).toBe(400);
    const body = (await bad.json()) as { error: string; issues: { location: string; path: string }[] };
    expect(body.error).toBe("validation_error");
    expect(body.issues).toEqual([expect.objectContaining({ location: "params", path: "app_id" })]);
  });

  test("declared non-200 responses", async () => {
    const res = await app.request(`/api/apps/00000000-0000-0000-0000-000000000000`, {
      headers: { authorization: "Bearer alice" },
    });
    expect(res.status).toBe(404);
  });

  test("admin route guard", async () => {
    const denied = await app.request("/api/apps", {
      method: "POST",
      headers: { authorization: "Bearer alice", "content-type": "application/json" },
      body: JSON.stringify({ name: "x" }),
    });
    expect(denied.status).toBe(403);
    const allowed = await app.request("/api/apps", {
      method: "POST",
      headers: { authorization: "Bearer root:admin", "content-type": "application/json" },
      body: JSON.stringify({ name: "x" }),
    });
    expect(allowed.status).toBe(201);
    expect(await allowed.json()).toEqual({ name: "x" });
  });

  test("body validation and media type enforcement", async () => {
    const invalid = await app.request("/api/apps", {
      method: "POST",
      headers: { authorization: "Bearer root:admin", "content-type": "application/json" },
      body: JSON.stringify({ name: "" }),
    });
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({ issues: [expect.objectContaining({ location: "body", path: "name" })] });

    const malformed = await app.request("/api/apps", {
      method: "POST",
      headers: { authorization: "Bearer root:admin", "content-type": "application/json" },
      body: "{",
    });
    expect(malformed.status).toBe(400);

    const wrongType = await app.request("/api/apps", {
      method: "POST",
      headers: { authorization: "Bearer root:admin", "content-type": "text/plain" },
      body: "name=x",
    });
    expect(wrongType.status).toBe(415);

    const missing = await app.request("/api/apps", {
      method: "POST",
      headers: { authorization: "Bearer root:admin" },
    });
    expect(missing.status).toBe(400);
  });

  test("form bodies", async () => {
    const res = await app.request("/api/form", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "grant_type=authorization_code",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ grant_type: "authorization_code" });
  });

  test("required scopes", async () => {
    const noScope = await app.request("/api/me/email", { headers: { authorization: "Bearer alice" } });
    expect(noScope.status).toBe(403);
    expect(noScope.headers.get("www-authenticate")).toBe('Bearer error="insufficient_scope", scope="email"');
    expect(await noScope.json()).toMatchObject({ error: "insufficient_scope", details: { missing_scopes: ["email"] } });

    const adminNoScope = await app.request("/api/me/email", { headers: { authorization: "Bearer root:admin" } });
    expect(adminNoScope.status).toBe(403);

    const withScope = await app.request("/api/me/email", { headers: { authorization: "Bearer alice:user:openid email" } });
    expect(withScope.status).toBe(200);
  });

  test("organization role requirement with admin bypass", async () => {
    const member = await app.request("/api/organizations/org-1/members", { headers: { authorization: "Bearer alice" } });
    expect(member.status).toBe(403);
    expect(await member.json()).toMatchObject({ error: "not_an_organization_member" });

    const outsider = await app.request("/api/organizations/org-2/members", { headers: { authorization: "Bearer alice" } });
    expect(outsider.status).toBe(403);

    const admin = await app.request("/api/organizations/org-2/members", { headers: { authorization: "Bearer root:admin" } });
    expect(admin.status).toBe(200);
  });

  test("OperationError from handlers and generic failures", async () => {
    const teapot = await app.request("/api/boom?kind=operation");
    expect(teapot.status).toBe(418);
    expect(await teapot.json()).toEqual({ success: false, error: "teapot", message: "I am a teapot" });

    const generic = await app.request("/api/boom?kind=generic");
    expect(generic.status).toBe(500);
    expect(await generic.json()).toEqual({ success: false, error: "internal_server_error", message: "Internal Server Error" });
    expect(errors.at(-1)).toBeInstanceOf(Error);

    const declaredEmpty = await app.request("/api/boom?kind=undeclared");
    expect(declaredEmpty.status).toBe(418);
  });

  test("404 for unknown routes", async () => {
    const res = await app.request("/api/nope");
    expect(res.status).toBe(404);
  });

  test("basePath prefixes routes", async () => {
    const prefixed = createOperationsApp<Ctx, User>({
      operations: [health],
      basePath: "/v2",
      context: () => ({ now: 1 }),
    });
    expect((await prefixed.request("/v2/api/health")).status).toBe(200);
    expect((await prefixed.request("/api/health")).status).toBe(404);
  });

  test("refuses operations without a resolver for their scheme", () => {
    expect(() => createOperationsApp<Ctx, User>({ operations: [getApp], authResolvers: {} })).toThrow(
      /no resolver was registered/,
    );
  });
});

describe("adapters", () => {
  test("toNextRouteHandlers exports one handler per method", async () => {
    const handlers = toNextRouteHandlers(app, ["get", "post"]);
    expect(Object.keys(handlers)).toEqual(["GET", "POST"]);
    const res = await handlers.GET(new Request("http://localhost/api/health"));
    expect(res.status).toBe(200);
  });

  test("toVercelHandler serves requests", async () => {
    const handler = toVercelHandler(app);
    const res = await handler(new Request("http://localhost/api/health"));
    expect(await res.json()).toEqual({ ok: true, now: 42 });
  });
});
