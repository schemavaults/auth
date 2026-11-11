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
import { defineScopes } from "../scopes/scope-definition";
import { oidcScopes } from "../scopes/oidc-scopes";
import { buildOpenApiDocument, collectAuthSchemes } from "./build-openapi-document";
import {
  SCHEMAVAULTS_AUTH_EXTENSION,
  SCHEMAVAULTS_SCHEME_TITLE_EXTENSION,
  SCHEMAVAULTS_SCOPES_EXTENSION,
  isSchemaVaultsScopesExtension,
} from "./extensions";

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
      [SCHEMAVAULTS_SCHEME_TITLE_EXTENSION]: "Access token (Bearer)",
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

describe("buildOpenApiDocument scopes", () => {
  const notesScopes = defineScopes({
    read: { scope: "notes:read", description: "Read your notes" },
    write: { scope: "notes:write", description: "Create and edit your notes" },
    share: { scope: "notes:share", description: "Share your notes with others" },
  });

  const readNotes = defineOperation({
    method: "get",
    path: "/api/notes",
    summary: "List notes",
    auth: requireAuth({
      schemes: [schemaVaultsAccessTokenBearerScheme],
      requiredScopes: [oidcScopes.openid, notesScopes.read],
    }),
    responses: { 200: { description: "Notes", schema: z.object({ notes: z.array(z.string()) }) } },
    handler: (ctx) => ctx.json(200, { notes: [] }),
  });

  const writeNotes = defineOperation({
    method: "post",
    path: "/api/notes",
    summary: "Create a note",
    auth: requireAuth({ schemes: [schemaVaultsAccessTokenBearerScheme], requiredScopes: [notesScopes.write, "openid"] }),
    responses: { 201: { description: "Created" } },
    handler: (ctx) => ctx.empty(201),
  });

  const doc = buildOpenApiDocument({
    info: { title: "Notes API", version: "1.0.0" },
    operations: [readNotes, writeNotes, health],
    additionalScopes: Object.values(notesScopes),
  });

  test("security requirements and the auth extension carry scope values", () => {
    expect(doc.paths?.["/api/notes"]?.get?.security).toEqual([
      { "schemavaults-access-token": ["openid", "notes:read"] },
    ]);
    expect(doc.paths?.["/api/notes"]?.get?.[SCHEMAVAULTS_AUTH_EXTENSION]).toMatchObject({
      requiredScopes: ["openid", "notes:read"],
    });
    expect(doc.paths?.["/api/notes"]?.post?.[SCHEMAVAULTS_AUTH_EXTENSION]).toMatchObject({
      requiredScopes: ["notes:write", "openid"],
    });
  });

  test("the document lists every scope with its description, additional scopes first", () => {
    const scopes = doc[SCHEMAVAULTS_SCOPES_EXTENSION];
    expect(isSchemaVaultsScopesExtension(scopes)).toBe(true);
    expect(scopes).toEqual([
      { scope: "notes:read", description: "Read your notes" },
      { scope: "notes:write", description: "Create and edit your notes" },
      { scope: "notes:share", description: "Share your notes with others" },
      { scope: "openid", description: "Sign you in with OpenID Connect" },
    ]);
  });

  test("bare scope values are listed without a description", () => {
    const scopes = buildOpenApiDocument({
      info: { title: "t", version: "1" },
      operations: [listApps],
    })[SCHEMAVAULTS_SCOPES_EXTENSION];
    expect(scopes).toEqual([{ scope: "email" }]);
  });

  test("no scopes, no extension", () => {
    const scopeless = buildOpenApiDocument({
      info: { title: "t", version: "1" },
      operations: [deleteMember, health],
    });
    expect(scopeless).not.toHaveProperty(SCHEMAVAULTS_SCOPES_EXTENSION);
  });

  test("refuses one scope described two ways", () => {
    const conflicting = defineOperation({
      method: "get",
      path: "/api/notes/{note_id}",
      summary: "Get a note",
      auth: requireAuth({
        schemes: [schemaVaultsAccessTokenBearerScheme],
        requiredScopes: [{ scope: "notes:read", description: "Read one note" }],
      }),
      request: { params: z.object({ note_id: z.string() }) },
      responses: { 200: { description: "Note", schema: z.object({}) } },
      handler: (ctx) => ctx.json(200, {}),
    });
    expect(() =>
      buildOpenApiDocument({ info: { title: "t", version: "1" }, operations: [readNotes, conflicting] }),
    ).toThrow(/defined twice with different descriptions/);
  });
});
