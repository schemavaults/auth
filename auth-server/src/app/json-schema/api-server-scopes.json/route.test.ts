import { afterEach, describe, expect, mock, test } from "bun:test";

// The route imports the `server-only` marker, which throws outside a React
// Server Components bundle.
mock.module("server-only", () => ({}));

const ORIGINAL_AUTH_SERVER_URL: string | undefined = process.env.SCHEMAVAULTS_AUTH_SERVER_URL;
afterEach(() => {
  if (ORIGINAL_AUTH_SERVER_URL === undefined) delete process.env.SCHEMAVAULTS_AUTH_SERVER_URL;
  else process.env.SCHEMAVAULTS_AUTH_SERVER_URL = ORIGINAL_AUTH_SERVER_URL;
});

describe("GET /json-schema/api-server-scopes.json", () => {
  test("serves the public, cacheable manifest schema named after the deployment's URL", async () => {
    const { GET } = await import("./route");
    process.env.SCHEMAVAULTS_AUTH_SERVER_URL = "https://auth.example.com";
    const response = GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/schema+json");
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("cache-control")).toBe("public, max-age=3600");
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(body.$id).toBe("https://auth.example.com/json-schema/api-server-scopes.json");

    // A white-label deployment's URL names itself.
    process.env.SCHEMAVAULTS_AUTH_SERVER_URL = "https://id.acme.test";
    const whiteLabel = (await GET().json()) as Record<string, unknown>;
    expect(whiteLabel.$id).toBe("https://id.acme.test/json-schema/api-server-scopes.json");
  });
});
