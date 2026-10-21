import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  OAUTH_PROTECTED_RESOURCE_WELL_KNOWN_PATH,
  buildOAuthProtectedResourceMetadata,
  createOAuthProtectedResourceMetadataRoute,
  isMetadataRequestForResource,
  oauthProtectedResourceMetadataUrl,
} from "./index";

const RESOURCE = "https://api.example.com/mcp";
const AUTH = "https://auth.example.com";
const ENV_KEYS = ["SCHEMAVAULTS_RESOURCE_URL", "SCHEMAVAULTS_AUTH_SERVER_URL", "SCHEMAVAULTS_APP_ENVIRONMENT"] as const;
const original = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

beforeEach(() => {
  for (const key of ENV_KEYS) delete process.env[key];
  process.env.SCHEMAVAULTS_APP_ENVIRONMENT = "production";
});
afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = original[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function get(path: string = OAUTH_PROTECTED_RESOURCE_WELL_KNOWN_PATH): Request {
  return new Request(`https://api.example.com${path}`);
}

describe("buildOAuthProtectedResourceMetadata", () => {
  test("emits the required members and omits unset optional ones", () => {
    expect(buildOAuthProtectedResourceMetadata({ resource: RESOURCE, authorization_servers: [`${AUTH}/`] })).toEqual({
      resource: RESOURCE,
      authorization_servers: [AUTH],
      bearer_methods_supported: ["header"],
    });
  });

  test("resolves document paths against the resource origin", () => {
    expect(
      buildOAuthProtectedResourceMetadata({
        resource: RESOURCE,
        authorization_servers: [AUTH],
        scopes_supported: ["openid", "email"],
        resource_name: "Example API",
        resource_documentation: "/docs",
        resource_policy_uri: "https://example.com/privacy",
      }),
    ).toEqual({
      resource: RESOURCE,
      authorization_servers: [AUTH],
      bearer_methods_supported: ["header"],
      scopes_supported: ["openid", "email"],
      resource_name: "Example API",
      resource_documentation: "https://api.example.com/docs",
      resource_policy_uri: "https://example.com/privacy",
    });
    expect(
      buildOAuthProtectedResourceMetadata({ resource: RESOURCE, authorization_servers: [AUTH], scopes_supported: [] }),
    ).not.toHaveProperty("scopes_supported");
  });
});

describe("oauthProtectedResourceMetadataUrl (RFC 9728 §3.1)", () => {
  test("inserts the well-known path between the host and the resource path", () => {
    expect(oauthProtectedResourceMetadataUrl("https://api.example.com")).toBe(
      "https://api.example.com/.well-known/oauth-protected-resource",
    );
    expect(oauthProtectedResourceMetadataUrl("https://api.example.com/")).toBe(
      "https://api.example.com/.well-known/oauth-protected-resource",
    );
    expect(oauthProtectedResourceMetadataUrl("http://localhost:3000/mcp/")).toBe(
      "http://localhost:3000/.well-known/oauth-protected-resource/mcp",
    );
  });
});

describe("isMetadataRequestForResource", () => {
  test("answers the bare path, the resource path and paths below it", () => {
    for (const path of ["", "/", "/mcp", "/mcp/", "/mcp/v1"]) {
      expect(isMetadataRequestForResource(`${OAUTH_PROTECTED_RESOURCE_WELL_KNOWN_PATH}${path}`, RESOURCE)).toBe(true);
    }
    // Reached through a rewrite: the handler cannot tell, so it answers.
    expect(isMetadataRequestForResource("/api/oauth-protected-resource", RESOURCE)).toBe(true);
  });

  test("refuses other resources' paths", () => {
    for (const path of ["/other", "/mcpx", "x"]) {
      expect(isMetadataRequestForResource(`${OAUTH_PROTECTED_RESOURCE_WELL_KNOWN_PATH}${path}`, RESOURCE)).toBe(false);
    }
  });

  test("answers every path for an origin-only resource", () => {
    expect(isMetadataRequestForResource(`${OAUTH_PROTECTED_RESOURCE_WELL_KNOWN_PATH}/anything`, "https://api.example.com")).toBe(true);
  });
});

describe("createOAuthProtectedResourceMetadataRoute", () => {
  test("serves the metadata for SCHEMAVAULTS_RESOURCE_URL and the configured auth server", async () => {
    process.env.SCHEMAVAULTS_RESOURCE_URL = RESOURCE;
    process.env.SCHEMAVAULTS_AUTH_SERVER_URL = AUTH;
    const { GET } = createOAuthProtectedResourceMetadataRoute({ resource_documentation: "/docs" });

    for (const path of [OAUTH_PROTECTED_RESOURCE_WELL_KNOWN_PATH, `${OAUTH_PROTECTED_RESOURCE_WELL_KNOWN_PATH}/mcp`]) {
      const res = await GET(get(path));
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("application/json");
      expect(res.headers.get("access-control-allow-origin")).toBe("*");
      expect(res.headers.get("cache-control")).toBe("public, max-age=3600");
      expect(await res.json()).toEqual({
        resource: RESOURCE,
        authorization_servers: [AUTH],
        bearer_methods_supported: ["header"],
        resource_documentation: "https://api.example.com/docs",
      });
    }
  });

  test("defaults the authorization server to the environment's auth server", async () => {
    process.env.SCHEMAVAULTS_RESOURCE_URL = RESOURCE;
    const { GET } = createOAuthProtectedResourceMetadataRoute();
    expect(await (await GET(get())).json()).toMatchObject({ authorization_servers: ["https://auth.schemavaults.com"] });
  });

  test("explicit options win over the environment", async () => {
    process.env.SCHEMAVAULTS_RESOURCE_URL = "https://ignored.example.com";
    const { GET } = createOAuthProtectedResourceMetadataRoute({
      resource: "https://api.example.com",
      authorization_servers: [AUTH],
      scopes_supported: ["openid"],
    });
    expect(await (await GET(get())).json()).toEqual({
      resource: "https://api.example.com",
      authorization_servers: [AUTH],
      bearer_methods_supported: ["header"],
      scopes_supported: ["openid"],
    });
  });

  test("answers 404 without a resource URL, or for another resource's path", async () => {
    const { GET } = createOAuthProtectedResourceMetadataRoute();
    const unset = await GET(get());
    expect(unset.status).toBe(404);
    expect(unset.headers.get("access-control-allow-origin")).toBe("*");
    expect(await unset.json()).toMatchObject({ error: "not_found" });

    process.env.SCHEMAVAULTS_RESOURCE_URL = RESOURCE;
    expect((await GET(get(`${OAUTH_PROTECTED_RESOURCE_WELL_KNOWN_PATH}/other`))).status).toBe(404);
  });

  test("answers 500 for an invalid resource URL", async () => {
    process.env.SCHEMAVAULTS_RESOURCE_URL = "http://api.example.com"; // not https in production
    const { GET } = createOAuthProtectedResourceMetadataRoute();
    const res = await GET(get());
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ error: "server_misconfiguration" });
  });

  test("answers CORS preflights", async () => {
    const { OPTIONS } = createOAuthProtectedResourceMetadataRoute();
    const res = await OPTIONS(
      new Request(`https://api.example.com${OAUTH_PROTECTED_RESOURCE_WELL_KNOWN_PATH}`, {
        method: "OPTIONS",
        headers: { "Access-Control-Request-Method": "GET", "Access-Control-Request-Headers": "mcp-protocol-version" },
      }),
    );
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("access-control-allow-methods")).toBe("GET, OPTIONS");
    expect(res.headers.get("access-control-allow-headers")).toBe("mcp-protocol-version");
  });
});
