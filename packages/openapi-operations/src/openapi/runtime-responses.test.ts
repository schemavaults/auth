import { describe, expect, test } from "bun:test";
import { z } from "../zod-openapi";
import { defineOperation } from "../operation";
import {
  apiKeyHeaderScheme,
  publicAccess,
  requireAuth,
  schemaVaultsAccessTokenBearerScheme,
  schemaVaultsAccessTokenCookieScheme,
} from "../auth-scheme";
import { buildOpenApiDocument } from "./build-openapi-document";
import { runtimeErrorResponses, withRuntimeErrorResponses } from "./runtime-responses";
import { OperationErrorBodySchema } from "../runtime/error-schema";

const ok = { 200: { description: "ok", schema: z.object({ ok: z.boolean() }) } } as const;

const health = defineOperation({
  method: "get",
  path: "/api/health",
  summary: "Health",
  auth: publicAccess(),
  responses: ok,
  handler: (ctx) => ctx.json(200, { ok: true }),
});

const getItem = defineOperation({
  method: "get",
  path: "/api/items/{id}",
  summary: "Get item",
  auth: requireAuth({ schemes: [schemaVaultsAccessTokenBearerScheme] }),
  request: { params: z.object({ id: z.string() }) },
  responses: {
    ...ok,
    401: { description: "Declared 401 wins" },
    404: { description: "No such item", schema: OperationErrorBodySchema },
  },
  handler: (ctx) => ctx.json(200, { ok: true }),
});

const createItem = defineOperation({
  method: "post",
  path: "/api/items",
  summary: "Create item",
  auth: requireAuth({
    schemes: [schemaVaultsAccessTokenCookieScheme("access_token_x"), apiKeyHeaderScheme("cron", "X-Cron")],
    routeGuard: "admin",
    requiredScopes: ["items:write"],
  }),
  request: { body: { schema: z.object({ name: z.string() }) } },
  responses: { 201: { description: "Created", schema: z.object({ ok: z.boolean() }) } },
  handler: (ctx) => ctx.json(201, { ok: true }),
});

const orgItems = defineOperation({
  method: "get",
  path: "/api/organizations/{organization_id}/items",
  summary: "Org items",
  auth: requireAuth({
    schemes: [schemaVaultsAccessTokenBearerScheme],
    organization: { parameter: "organization_id", roles: [] },
  }),
  request: { params: z.object({ organization_id: z.string() }) },
  responses: ok,
  handler: (ctx) => ctx.json(200, { ok: true }),
});

const documentOnlyBody = defineOperation({
  method: "post",
  path: "/api/token",
  summary: "Token",
  auth: publicAccess(),
  request: { body: { schema: z.object({ grant_type: z.string() }), documentOnly: true } },
  responses: ok,
  handler: (ctx) => ctx.json(200, { ok: true }),
});

describe("runtimeErrorResponses", () => {
  test("public operation without inputs only gets the 500", () => {
    expect(Object.keys(runtimeErrorResponses(health))).toEqual(["500"]);
  });

  test("protected operation with params gets 400, 401 (+ WWW-Authenticate) and 500", () => {
    const responses = runtimeErrorResponses(getItem);
    expect(Object.keys(responses)).toEqual(["400", "401", "500"]);
    expect(responses[401]?.headers?.shape).toHaveProperty("WWW-Authenticate");
    expect(responses[400]?.schema).toBe(OperationErrorBodySchema);
  });

  test("admin / scopes / validated body add 403 and 415", () => {
    const responses = runtimeErrorResponses(createItem);
    expect(Object.keys(responses)).toEqual(["400", "401", "403", "415", "500"]);
    expect(responses[403]?.description).toContain("platform administrator");
    expect(responses[403]?.description).toContain("required scope");
    expect(responses[415]?.description).toContain("application/json");
    // no scheme carries a challenge here: no header documented
    expect(responses[401]?.headers).toBeUndefined();
  });

  test("organization requirement adds 400 and 403", () => {
    const responses = runtimeErrorResponses(orgItems);
    expect(Object.keys(responses)).toEqual(["400", "401", "403", "500"]);
    expect(responses[400]?.description).toContain("organization parameter");
    expect(responses[403]?.description).toContain("organization role");
  });

  test("document-only bodies are neither validated (400) nor media-type checked (415)", () => {
    expect(Object.keys(runtimeErrorResponses(documentOnlyBody))).toEqual(["500"]);
  });

  test("withRuntimeErrorResponses keeps declared responses and the handler", () => {
    const copy = withRuntimeErrorResponses(getItem);
    expect(copy.responses[401]).toEqual({ description: "Declared 401 wins" });
    expect(copy.responses[404]).toBe(getItem.responses[404]);
    expect(copy.responses[400]?.schema).toBe(OperationErrorBodySchema);
    expect(copy.handler).toBe(getItem.handler);
    expect((getItem.responses as Record<number, unknown>)[500]).toBeUndefined();
  });
});

describe("buildOpenApiDocument({ documentRuntimeResponses })", () => {
  const operations = [health, getItem, createItem, orgItems];
  const plain = buildOpenApiDocument({ info: { title: "t", version: "1" }, operations });
  const documented = buildOpenApiDocument({
    info: { title: "t", version: "1" },
    operations,
    documentRuntimeResponses: true,
  });

  test("is off by default", () => {
    expect(Object.keys(plain.paths?.["/api/health"]?.get?.responses ?? {})).toEqual(["200"]);
    expect(Object.keys(plain.paths?.["/api/items"]?.post?.responses ?? {})).toEqual(["201"]);
    const withoutDeclaredEnvelope = buildOpenApiDocument({
      info: { title: "t", version: "1" },
      operations: [health, createItem],
    });
    expect(withoutDeclaredEnvelope.components?.schemas?.OperationError).toBeUndefined();
  });

  test("merges the runtime responses per operation, declared ones first", () => {
    expect(Object.keys(documented.paths?.["/api/health"]?.get?.responses ?? {})).toEqual(["200", "500"]);
    const get = documented.paths?.["/api/items/{id}"]?.get?.responses ?? {};
    expect(Object.keys(get).sort()).toEqual(["200", "400", "401", "404", "500"]);
    expect(get["401"]).toEqual({ description: "Declared 401 wins" });
    expect(JSON.stringify(get["400"])).toContain("#/components/schemas/OperationError");
    expect(get["500"]).toMatchObject({ description: "Unexpected server error." });
    const post = documented.paths?.["/api/items"]?.post?.responses ?? {};
    expect(Object.keys(post).sort()).toEqual(["201", "400", "401", "403", "415", "500"]);
  });

  test("registers the error envelope under components.schemas.OperationError", () => {
    expect(documented.components?.schemas?.OperationError).toMatchObject({
      type: "object",
      required: ["success", "error", "message"],
    });
    expect(documented.components?.schemas?.OperationValidationIssue).toMatchObject({ type: "object" });
    const unauthorized = documented.paths?.["/api/organizations/{organization_id}/items"]?.get?.responses?.["401"];
    expect(JSON.stringify(unauthorized)).toContain("WWW-Authenticate");
  });
});
