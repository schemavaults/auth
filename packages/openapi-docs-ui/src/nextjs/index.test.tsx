import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { apiReferenceTitle, createApiDocsPages } from "./index";

const document = {
  openapi: "3.1.0",
  info: { title: "Factory API", version: "1.0.0" },
  servers: [{ url: "/", description: "This server" }],
  paths: {
    "/api/health": { get: { summary: "Health", security: [], responses: { "200": { description: "ok" } } } },
    "/api/ping": {
      post: {
        summary: "Ping",
        security: [{ bearer: [] }],
        responses: { "200": { description: "pong" } },
      },
    },
  },
  components: { securitySchemes: { bearer: { type: "http", scheme: "bearer" } } },
};

describe("createApiDocsPages", () => {
  let serverUrlCalls = 0;
  const pages = createApiDocsPages({
    loadDocument: () => document,
    basePath: "/docs",
    openApiDocumentHref: "/api/openapi.json",
    resolveServerUrl: () => {
      serverUrlCalls += 1;
      return "https://api.example.test";
    },
    wrap: (page) => <main data-wrapped="true">{page}</main>,
  });

  test("generateStaticParams lists every operation slug without resolving the server URL", async () => {
    const before = serverUrlCalls;
    expect(await pages.generateStaticParams()).toEqual([
      { slug: "get-api-health" },
      { slug: "post-api-ping" },
    ]);
    expect(serverUrlCalls).toBe(before);
  });

  test("IndexPage renders inside wrap with the resolved server URL", async () => {
    const html = renderToStaticMarkup(await pages.IndexPage());
    expect(html).toContain('data-wrapped="true"');
    expect(html).toContain("Factory API");
    expect(html).toContain("https://api.example.test");
    expect(html).toContain("This server");
    expect(html).toContain('href="/docs/post-api-ping"');
  });

  test("OperationPage renders the operation and uses the server URL in curl", async () => {
    const html = renderToStaticMarkup(
      await pages.OperationPage({ params: Promise.resolve({ slug: "post-api-ping" }) }),
    );
    expect(html).toContain("Ping");
    expect(html).toContain("curl -X POST &#x27;https://api.example.test/api/ping&#x27;");
  });

  test("OperationPage calls notFound() for unknown slugs", async () => {
    await expect(
      pages.OperationPage({ params: Promise.resolve({ slug: "get-api-nope" }) }),
    ).rejects.toThrow();
  });

  test("apiReferenceTitle does not double a trailing API", () => {
    expect(apiReferenceTitle("Factory API")).toBe("Factory API reference");
    expect(apiReferenceTitle("Acme Identity")).toBe("Acme Identity API reference");
    expect(apiReferenceTitle("Rapid")).toBe("Rapid API reference");
  });

  test("metadata helpers", async () => {
    expect(await pages.generateIndexMetadata()).toEqual({ title: "Factory API reference" });
    expect(
      await pages.generateOperationMetadata({ params: Promise.resolve({ slug: "get-api-health" }) }),
    ).toEqual({ title: "GET /api/health | Factory API", description: "Health" });
  });
});
