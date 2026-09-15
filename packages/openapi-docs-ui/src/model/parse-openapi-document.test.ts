import { describe, expect, test } from "bun:test";
import { parseOpenApiDocument } from "./parse-openapi-document";
import { findOperationBySlug, operationDocsHref, operationSlug } from "./slug";
import { exampleFromSchema, schemaProperties, schemaTypeLabel } from "./schema-utils";

const document = {
  openapi: "3.1.0",
  info: { title: "Auth API", version: "2.0.0", description: "Test" },
  servers: [{ url: "https://auth.example.com", description: "prod" }],
  tags: [{ name: "apps", description: "Client apps" }],
  security: [{ "doc-level": [] }],
  components: {
    securitySchemes: {
      "schemavaults-access-token": {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        "x-schemavaults-title": "Access token",
        "x-schemavaults-challenge": 'Bearer realm="x"',
      },
      "doc-level": { type: "apiKey", in: "header", name: "X-Key" },
    },
    schemas: {
      App: {
        type: "object",
        properties: { app_id: { type: "string", format: "uuid" }, name: { type: "string" } },
        required: ["app_id"],
      },
      AppList: {
        type: "object",
        properties: { list: { type: "array", items: { $ref: "#/components/schemas/App" } } },
        required: ["list"],
      },
    },
    parameters: {
      Trace: { name: "x-trace", in: "header", schema: { type: "string" } },
    },
  },
  paths: {
    "/api/apps": {
      parameters: [{ $ref: "#/components/parameters/Trace" }],
      get: {
        operationId: "listApps",
        summary: "List apps",
        tags: ["apps"],
        security: [{ "schemavaults-access-token": ["email"] }],
        "x-schemavaults-auth": {
          public: false,
          schemes: ["schemavaults-access-token"],
          routeGuard: "admin",
          requiredScopes: ["email"],
          organization: { parameter: "organization_id", roles: ["owner"], adminBypass: false },
          notes: "Admins only",
        },
        parameters: [
          { name: "list_apps_query_type", in: "query", schema: { type: "string", enum: ["all", "owned"] } },
        ],
        responses: {
          "200": {
            description: "ok",
            content: { "application/json": { schema: { $ref: "#/components/schemas/AppList" } } },
            headers: { "x-total": { schema: { type: "integer" } } },
          },
        },
      },
      post: {
        summary: "Create",
        tags: ["apps"],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/App" } } },
        },
        responses: { "201": { description: "created" } },
      },
    },
    "/api/health": {
      get: { summary: "Health", security: [], responses: { "200": { description: "ok" } } },
    },
    "/api/legacy": {
      get: { responses: { "200": { description: "ok" } } },
    },
  },
};

describe("parseOpenApiDocument", () => {
  const model = parseOpenApiDocument(document);

  test("document metadata", () => {
    expect(model.title).toBe("Auth API");
    expect(model.version).toBe("2.0.0");
    expect(model.servers).toEqual([{ url: "https://auth.example.com", description: "prod" }]);
    expect(model.operations.map((op) => op.slug)).toEqual([
      "get-api-apps",
      "post-api-apps",
      "get-api-health",
      "get-api-legacy",
    ]);
  });

  test("groups operations by tag with Other for untagged", () => {
    expect(model.tags.map((tag) => [tag.name, tag.operations.length])).toEqual([
      ["apps", 2],
      ["Other", 2],
    ]);
    expect(model.tags[0]?.description).toBe("Client apps");
  });

  test("resolves parameters, bodies and responses", () => {
    const list = findOperationBySlug(model, "get-api-apps");
    expect(list?.operationId).toBe("listApps");
    expect(list?.parameters.map((p) => [p.in, p.name, p.required])).toEqual([
      ["query", "list_apps_query_type", false],
      ["header", "x-trace", false],
    ]);
    expect(list?.responses[0]).toMatchObject({
      status: "200",
      description: "ok",
      content: [{ contentType: "application/json", schema: { $ref: "#/components/schemas/AppList" } }],
      headers: [{ name: "x-total", schema: { type: "integer" } }],
    });
    const create = findOperationBySlug(model, "post-api-apps");
    expect(create?.requestBody).toMatchObject({ required: true, content: [{ contentType: "application/json" }] });
    expect(create?.summary).toBe("Create");
  });

  test("auth from the x-schemavaults-auth extension", () => {
    const list = findOperationBySlug(model, "get-api-apps");
    expect(list?.auth).toEqual({
      public: false,
      alternatives: [[{ schemeName: "schemavaults-access-token", scopes: ["email"] }]],
      schemeNames: ["schemavaults-access-token"],
      routeGuard: "admin",
      requiredScopes: ["email"],
      organization: { parameter: "organization_id", roles: ["owner"], adminBypass: false },
      notes: "Admins only",
      source: "x-schemavaults-auth",
    });
  });

  test("auth derived from security (explicit empty = public, inherited doc-level)", () => {
    expect(findOperationBySlug(model, "get-api-health")?.auth).toMatchObject({
      public: true,
      routeGuard: null,
      source: "security",
    });
    expect(findOperationBySlug(model, "get-api-legacy")?.auth).toMatchObject({
      public: false,
      schemeNames: ["doc-level"],
      routeGuard: "authenticated",
      source: "security",
    });
  });

  test("security schemes", () => {
    expect(model.securitySchemes).toEqual([
      {
        name: "schemavaults-access-token",
        type: "http",
        title: "Access token",
        scheme: "bearer",
        bearerFormat: "JWT",
        challenge: 'Bearer realm="x"',
        flows: [],
      },
      { name: "doc-level", type: "apiKey", title: "API key in header (doc-level)", in: "header", parameterName: "X-Key", flows: [] },
    ]);
  });

  test("rejects non-objects", () => {
    expect(() => parseOpenApiDocument("nope")).toThrow(TypeError);
  });

  test("slug collisions get suffixed", () => {
    const collision = parseOpenApiDocument({
      openapi: "3.1.0",
      info: { title: "t", version: "1" },
      paths: {
        "/a-b": { get: { operationId: "first", responses: {} } },
        "/a_b": { get: { operationId: "second", responses: {} } },
      },
    });
    expect(collision.operations.map((op) => op.slug)).toEqual(["get-a-b", "get-a_b"]);
    const collision2 = parseOpenApiDocument({
      openapi: "3.1.0",
      info: { title: "t", version: "1" },
      paths: {
        "/a/b": { get: { operationId: "first", responses: {} } },
        "/a-b": { get: { operationId: "second", responses: {} } },
      },
    });
    expect(collision2.operations.map((op) => op.slug)).toEqual(["get-a-b", "get-a-b-second"]);
  });
});

describe("slug helpers", () => {
  test("operationSlug", () => {
    expect(operationSlug("GET", "/api/orgs/{organization_id}/members")).toBe("get-api-orgs-organization_id-members");
    expect(operationSlug("get", "/")).toBe("get-root");
  });
  test("operationDocsHref", () => {
    expect(operationDocsHref("/docs/", { slug: "get-api-apps" })).toBe("/docs/get-api-apps");
  });
});

describe("schema utils", () => {
  const model = parseOpenApiDocument(document);
  test("type labels follow refs and arrays", () => {
    expect(schemaTypeLabel({ $ref: "#/components/schemas/App" }, model.schemas)).toBe("App");
    expect(schemaTypeLabel({ type: "array", items: { $ref: "#/components/schemas/App" } }, model.schemas)).toBe("App[]");
    expect(schemaTypeLabel({ type: "string", format: "uuid" }, model.schemas)).toBe("string (uuid)");
    expect(schemaTypeLabel({ enum: ["a", "b"] }, model.schemas)).toBe('"a" | "b"');
    expect(schemaTypeLabel({ anyOf: [{ type: "string" }, { type: "null" }] }, model.schemas)).toBe("string | null");
  });
  test("properties merge allOf and resolve refs", () => {
    const props = schemaProperties({ allOf: [{ $ref: "#/components/schemas/App" }, { properties: { extra: { type: "boolean" } } }] }, model.schemas);
    expect(props.map((p) => [p.name, p.required])).toEqual([["app_id", true], ["name", false], ["extra", false]]);
  });
  test("examples", () => {
    expect(exampleFromSchema({ $ref: "#/components/schemas/AppList" }, model.schemas)).toEqual({
      list: [{ app_id: "123e4567-e89b-12d3-a456-426614174000", name: "string" }],
    });
    expect(exampleFromSchema({ type: "string", enum: ["x"] }, model.schemas)).toBe("x");
  });
});
