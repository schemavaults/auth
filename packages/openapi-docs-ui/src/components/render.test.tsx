import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { parseOpenApiDocument } from "@/model/parse-openapi-document";
import { ApiDocsIndex } from "./ApiDocsIndex";
import { ApiOperationPage } from "./ApiOperationPage";
import { buildCurlCommand } from "./CurlSnippet";
import { SchemaViewer } from "./SchemaViewer";

const document = {
  openapi: "3.1.0",
  info: { title: "Sample API", version: "1.2.3", description: "Sample description" },
  servers: [{ url: "https://api.example.com" }],
  tags: [{ name: "apps", description: "Client apps" }],
  components: {
    securitySchemes: {
      "schemavaults-access-token": {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        "x-schemavaults-title": "SchemaVaults access token (Bearer)",
        "x-schemavaults-challenge": 'Bearer realm="schemavaults"',
      },
    },
    schemas: {
      App: {
        type: "object",
        description: "A client application",
        properties: {
          app_id: { type: "string", format: "uuid" },
          name: { type: "string", minLength: 1 },
          parent: { $ref: "#/components/schemas/App" },
        },
        required: ["app_id", "name"],
      },
    },
  },
  paths: {
    "/api/apps/{app_id}": {
      get: {
        operationId: "getApp",
        summary: "Get an app",
        description: "Returns one app.",
        tags: ["apps"],
        security: [{ "schemavaults-access-token": ["email"] }],
        "x-schemavaults-auth": {
          public: false,
          schemes: ["schemavaults-access-token"],
          routeGuard: "admin",
          requiredScopes: ["email"],
          organization: { parameter: "organization_id", roles: ["owner", "admin"], adminBypass: true },
          notes: "Owners only.",
        },
        parameters: [
          { name: "app_id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          { name: "include", in: "query", schema: { type: "string", enum: ["domains", "apis"] } },
          { name: "x-trace", in: "header", required: true, schema: { type: "string" } },
        ],
        responses: {
          "200": {
            description: "The app",
            content: { "application/json": { schema: { $ref: "#/components/schemas/App" } } },
          },
          "404": { description: "Not found" },
        },
      },
      patch: {
        summary: "Update an app",
        tags: ["apps"],
        security: [{ "schemavaults-access-token": [] }],
        parameters: [{ name: "app_id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/App" } } },
        },
        responses: { "204": { description: "Updated" } },
      },
    },
    "/api/health": {
      get: { summary: "Health", security: [], responses: { "200": { description: "ok" } } },
    },
  },
};

const model = parseOpenApiDocument(document);

describe("ApiDocsIndex", () => {
  const html = renderToStaticMarkup(
    <ApiDocsIndex model={model} basePath="/docs" openApiDocumentHref="/api/openapi.json" />,
  );

  test("renders header, schemes and operation rows with links", () => {
    expect(html).toContain("Sample API");
    expect(html).toContain("v1.2.3");
    expect(html).toContain("SchemaVaults access token (Bearer)");
    expect(html).toContain('href="/docs/get-api-apps-app_id"');
    expect(html).toContain('href="/docs/patch-api-apps-app_id"');
    expect(html).toContain('href="/docs/get-api-health"');
    expect(html).toContain("Client apps");
    expect(html).toContain("Other");
  });

  test("shows access badges", () => {
    expect(html).toContain("Admin");
    expect(html).toContain("scope:email");
    expect(html).toContain("org owner / admin");
    expect(html).toContain("Public");
  });
});

describe("ApiOperationPage", () => {
  const operation = model.operations[0];
  if (!operation) throw new Error("fixture has no operations");
  const html = renderToStaticMarkup(<ApiOperationPage model={model} operation={operation} basePath="/docs" />);

  test("renders breadcrumb, auth card, parameters, responses and curl", () => {
    expect(html).toContain('href="/docs"');
    expect(html).toContain("Get an app");
    expect(html).toContain("Platform administrators only");
    expect(html).toContain("Owners only.");
    expect(html).toContain("organization_id");
    expect(html).toContain("Path parameters");
    expect(html).toContain("Query parameters");
    expect(html).toContain("Request headers");
    expect(html).toContain("The app");
    expect(html).toContain("Not found");
    expect(html).toContain("curl -X GET");
    expect(html).toContain("Other methods on this path");
    expect(html).toContain('href="/docs/patch-api-apps-app_id"');
  });
});

describe("SchemaViewer", () => {
  test("renders nested properties and stops on recursion", () => {
    const html = renderToStaticMarkup(
      <SchemaViewer schema={{ $ref: "#/components/schemas/App" }} schemas={model.schemas} />,
    );
    expect(html).toContain("app_id");
    expect(html).toContain("string (uuid)");
    expect(html).toContain("minLength: 1");
    expect(html).toContain("recursive reference");
  });
});

describe("buildCurlCommand", () => {
  test("includes auth header, required params and body", () => {
    const patch = model.operations.find((op) => op.method === "PATCH");
    if (!patch) throw new Error("no PATCH op");
    const command = buildCurlCommand(patch, model);
    expect(command).toContain("curl -X PATCH 'https://api.example.com/api/apps/<app_id>'");
    expect(command).toContain("Authorization: Bearer <access_token>");
    expect(command).toContain("Content-Type: application/json");
    expect(command).toContain('"app_id": "123e4567-e89b-12d3-a456-426614174000"');
    const get = model.operations[0];
    if (!get) throw new Error("no op");
    expect(buildCurlCommand(get, model, "http://localhost:6767/")).toContain(
      "'http://localhost:6767/api/apps/<app_id>'",
    );
    expect(buildCurlCommand(get, model)).toContain("-H 'x-trace: <x-trace>'");
  });
});
