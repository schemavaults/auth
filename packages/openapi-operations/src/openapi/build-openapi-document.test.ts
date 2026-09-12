import { describe, expect, test } from "bun:test";
import { z } from "../zod";
import { defineOperation } from "../operation";
import {
  apiKeyHeaderScheme,
  publicAccess,
  requireAuth,
  schemaVaultsAccessTokenBearerScheme,
  schemaVaultsAccessTokenCookieScheme,
} from "../auth-scheme";
import { buildOpenApiDocument, collectAuthSchemes } from "./build-openapi-document";
import { SCHEMAVAULTS_AUTH_EXTENSION, SCHEMAVAULTS_SCHEME_TITLE_EXTENSION } from "./extensions";

const AppSchema = z
  .object({ app_id: z.string().uuid(), name: z.string() })
  .openapi("App", { description: "A client application" });

const cookieScheme = schemaVaultsAccessTokenCookieScheme("sv_access_token");

const listApps = defineOperation({
  method: "get",
  path: "/api/apps",
  summary: "List apps",
  tags: ["apps"],
  auth: requireAuth({
    schemes: [schemaVaultsAccessTokenBearerScheme, cookieScheme],
    requiredScopes: ["email"],
  }),
  request: { query: z.object({ list_apps_query_type: z.enum(["all", "owned"]).optional() }) },
  responses: {
    200: { description: "Apps", schema: z.object({ list: z.array(AppSchema) }) },
    401: { description: "Not signed in" },
  },
  handler: (ctx) => ctx.json(200, { list: [] }),
});

const deleteMember = defineOperation({
  method: "delete",
  path: "/api/organizations/{organization_id}/members/{uid}",
  summary: "Remove member",
  tags: ["organizations"],
  auth: requireAuth({
    schemes: [schemaVaultsAccessTokenBearerScheme],
    routeGuard: "authenticated",
    organization: { parameter: "organization_id", roles: ["owner", "admin"] },
    notes: "Owners cannot remove themselves.",
  }),
  request: { params: z.object({ organization_id: z.string(), uid: z.string() }) },
  responses: { 204: { description: "Removed" } },
  handler: (ctx) => ctx.empty(204),
});

const health = defineOperation({
  method: "get",
  path: "/api/health",
  summary: "Health",
  auth: publicAccess("Unauthenticated liveness probe"),
  responses: { 200: { description: "ok", schema: z.object({ ok: z.literal(true) }) } },
  handler: (ctx) => ctx.json(200, { ok: true }),
});

describe("buildOpenApiDocument", () => {
  const doc = buildOpenApiDocument({
    info: { title: "Test API", version: "1.0.0" },
    servers: [{ url: "https://auth.example.com" }],
    tags: [{ name: "apps", description: "Client applications" }],
    operations: [listApps, deleteMember, health],
    additionalAuthSchemes: [apiKeyHeaderScheme("cron-key", "X-Cron-Key")],
  });

  test("emits paths with security requirements and the auth extension", () => {
    const op = doc.paths?.["/api/apps"]?.get;
    expect(op?.operationId).toBe("get_api_apps");
    expect(op?.security).toEqual([
      { "schemavaults-access-token": ["email"] },
      { "schemavaults-access-token-cookie": ["email"] },
    ]);
    expect(op?.[SCHEMAVAULTS_AUTH_EXTENSION]).toEqual({
      public: false,
      schemes: ["schemavaults-access-token", "schemavaults-access-token-cookie"],
      routeGuard: "authenticated",
      requiredScopes: ["email"],
      organization: null,
    });
    expect(op?.parameters).toEqual([
      expect.objectContaining({ name: "list_apps_query_type", in: "query", required: false }),
    ]);
  });

  test("public operations carry an empty security list and public extension", () => {
    const op = doc.paths?.["/api/health"]?.get;
    expect(op?.security).toEqual([]);
    expect(op?.[SCHEMAVAULTS_AUTH_EXTENSION]).toEqual({
      public: true,
      schemes: [],
      routeGuard: null,
      requiredScopes: [],
      organization: null,
      notes: "Unauthenticated liveness probe",
    });
  });

  test("organization requirements are documented", () => {
    const op = doc.paths?.["/api/organizations/{organization_id}/members/{uid}"]?.delete;
    expect(op?.[SCHEMAVAULTS_AUTH_EXTENSION]).toMatchObject({
      organization: { parameter: "organization_id", roles: ["owner", "admin"], adminBypass: true },
      notes: "Owners cannot remove themselves.",
    });
    expect(op?.responses?.["204"]).toEqual({ description: "Removed" });
  });

  test("registers security schemes and referenced zod schemas as components", () => {
    const schemes = doc.components?.securitySchemes ?? {};
    expect(Object.keys(schemes).sort()).toEqual([
      "cron-key",
      "schemavaults-access-token",
      "schemavaults-access-token-cookie",
    ]);
    expect(schemes["schemavaults-access-token"]).toMatchObject({
      type: "http",
      scheme: "bearer",
      [SCHEMAVAULTS_SCHEME_TITLE_EXTENSION]: "SchemaVaults access token (Bearer)",
    });
    expect(schemes["schemavaults-access-token-cookie"]).toMatchObject({
      type: "apiKey",
      in: "cookie",
      name: "sv_access_token",
    });
    expect(doc.components?.schemas?.App).toMatchObject({ type: "object" });
    const response = doc.paths?.["/api/apps"]?.get?.responses?.["200"];
    expect(JSON.stringify(response)).toContain("#/components/schemas/App");
  });

  test("merges declared and discovered tags", () => {
    expect(doc.tags).toEqual([
      { name: "apps", description: "Client applications" },
      { name: "organizations" },
    ]);
    expect(doc.openapi).toBe("3.1.0");
    expect(doc.servers).toEqual([{ url: "https://auth.example.com" }]);
  });

  test("collectAuthSchemes rejects conflicting definitions with the same name", () => {
    const other = apiKeyHeaderScheme("cron-key", "X-Other");
    expect(() =>
      collectAuthSchemes([], [apiKeyHeaderScheme("cron-key", "X-Cron-Key"), other]),
    ).toThrow(/defined twice/);
  });
});
