import { afterEach, describe, expect, test } from "bun:test";
import {
  RESOURCE_URL_ENV_VAR_NAME,
  getSchemaVaultsResourceUrl,
  parseResourceUrl,
  resourceUrlAudiences,
} from "./get-schemavaults-resource-url";

const original: string | undefined = process.env[RESOURCE_URL_ENV_VAR_NAME];
afterEach(() => {
  if (original === undefined) delete process.env[RESOURCE_URL_ENV_VAR_NAME];
  else process.env[RESOURCE_URL_ENV_VAR_NAME] = original;
});

describe("parseResourceUrl", () => {
  test("returns http(s) URLs verbatim (trimmed)", () => {
    expect(parseResourceUrl("https://api.example.com", "production")).toBe("https://api.example.com");
    expect(parseResourceUrl(" https://api.example.com/mcp/ ", "production")).toBe("https://api.example.com/mcp/");
    expect(parseResourceUrl("http://localhost:3000", "development")).toBe("http://localhost:3000");
  });

  test("requires https in production and staging", () => {
    expect(() => parseResourceUrl("http://api.example.com", "production")).toThrow(/https/);
    expect(() => parseResourceUrl("http://api.example.com", "staging")).toThrow(/https/);
    expect(parseResourceUrl("http://example-nextjs-resource-server/api", "test")).toBe(
      "http://example-nextjs-resource-server/api",
    );
  });

  test("rejects relative URLs, other schemes, queries, fragments and credentials", () => {
    for (const value of [
      "/api",
      "api.example.com",
      "ftp://api.example.com",
      "https://api.example.com/?tenant=1",
      "https://api.example.com/#x",
      "https://user:pass@api.example.com",
    ]) {
      expect(() => parseResourceUrl(value, "development")).toThrow(TypeError);
    }
  });
});

describe("getSchemaVaultsResourceUrl", () => {
  test("is null when unset or empty", () => {
    delete process.env[RESOURCE_URL_ENV_VAR_NAME];
    expect(getSchemaVaultsResourceUrl("production")).toBeNull();
    process.env[RESOURCE_URL_ENV_VAR_NAME] = "  ";
    expect(getSchemaVaultsResourceUrl("production")).toBeNull();
  });

  test("reads and validates the env var", () => {
    process.env[RESOURCE_URL_ENV_VAR_NAME] = "https://api.example.com/mcp";
    expect(getSchemaVaultsResourceUrl("production")).toBe("https://api.example.com/mcp");
    process.env[RESOURCE_URL_ENV_VAR_NAME] = "http://api.example.com";
    expect(() => getSchemaVaultsResourceUrl("production")).toThrow(RESOURCE_URL_ENV_VAR_NAME);
  });
});

describe("resourceUrlAudiences", () => {
  test("pairs the URL with its trailing-slash twin", () => {
    expect(resourceUrlAudiences("https://api.example.com")).toEqual([
      "https://api.example.com",
      "https://api.example.com/",
    ]);
    expect(resourceUrlAudiences("https://api.example.com/mcp/")).toEqual([
      "https://api.example.com/mcp/",
      "https://api.example.com/mcp",
    ]);
  });
});
