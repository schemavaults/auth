import { describe, expect, test } from "bun:test";
import {
  DEFAULT_RESOURCE_URL_MATCH_MODE,
  doesResourceUrlMatchApiServerDomain,
  resourceUrlMatchModeSchema,
} from "./api-server-dynamic-clients";
import { schemaVaultsApiServerDefinitionSchema } from "./api-server-definition";

const DOMAIN = "https://api.example.com";

describe("doesResourceUrlMatchApiServerDomain", () => {
  test("exact mode matches the origin only (trailing slash tolerated)", () => {
    expect(doesResourceUrlMatchApiServerDomain(DOMAIN, DOMAIN, "exact")).toBe(true);
    expect(doesResourceUrlMatchApiServerDomain(`${DOMAIN}/`, DOMAIN, "exact")).toBe(true);
    expect(doesResourceUrlMatchApiServerDomain(DOMAIN, `${DOMAIN}/`, "exact")).toBe(true);
    expect(doesResourceUrlMatchApiServerDomain(`${DOMAIN}/mcp`, DOMAIN, "exact")).toBe(false);
    expect(doesResourceUrlMatchApiServerDomain(`${DOMAIN}:8443`, DOMAIN, "exact")).toBe(false);
    expect(doesResourceUrlMatchApiServerDomain("https://api.example.community", DOMAIN, "exact")).toBe(false);
  });

  test("prefix mode also matches paths under the origin", () => {
    expect(doesResourceUrlMatchApiServerDomain(`${DOMAIN}/mcp`, DOMAIN, "prefix")).toBe(true);
    expect(doesResourceUrlMatchApiServerDomain(`${DOMAIN}/mcp/`, DOMAIN, "prefix")).toBe(true);
    expect(doesResourceUrlMatchApiServerDomain(`${DOMAIN}/a/b?c=d`, DOMAIN, "prefix")).toBe(true);
    expect(doesResourceUrlMatchApiServerDomain(DOMAIN, DOMAIN, "prefix")).toBe(true);
    // Host / port must still match exactly: no "api.example.com.evil".
    expect(doesResourceUrlMatchApiServerDomain("https://api.example.com.evil/x", DOMAIN, "prefix")).toBe(false);
    expect(doesResourceUrlMatchApiServerDomain(`${DOMAIN}:8443/mcp`, DOMAIN, "prefix")).toBe(false);
    expect(doesResourceUrlMatchApiServerDomain("http://api.example.com/mcp", DOMAIN, "prefix")).toBe(false);
  });

  test("defaults to exact matching", () => {
    expect(DEFAULT_RESOURCE_URL_MATCH_MODE).toBe("exact");
    expect(doesResourceUrlMatchApiServerDomain(`${DOMAIN}/mcp`, DOMAIN)).toBe(false);
    expect(resourceUrlMatchModeSchema.safeParse("origin").success).toBe(false);
  });

  test("rejects empty or non-string input", () => {
    expect(doesResourceUrlMatchApiServerDomain("", DOMAIN, "prefix")).toBe(false);
    expect(doesResourceUrlMatchApiServerDomain(DOMAIN, "", "prefix")).toBe(false);
    expect(doesResourceUrlMatchApiServerDomain(undefined as unknown as string, DOMAIN)).toBe(false);
  });
});

describe("API server definition dynamic-client fields", () => {
  const base = {
    api_server_id: "my-api",
    api_server_name: "My API",
    api_server_description: "",
    created_at: 1,
    public: false,
    hardcoded: false,
    owner_type: "platform",
  } as const;

  test("are optional and default to absent", () => {
    const parsed = schemaVaultsApiServerDefinitionSchema.safeParse(base);
    expect(parsed.success).toBe(true);
    expect(parsed.data?.allow_dynamic_clients).toBeUndefined();
    expect(parsed.data?.resource_url_match_mode).toBeUndefined();
  });

  test("accept the policy fields and reject unknown match modes", () => {
    expect(
      schemaVaultsApiServerDefinitionSchema.safeParse({
        ...base,
        allow_dynamic_clients: true,
        resource_url_match_mode: "prefix",
      }).success,
    ).toBe(true);
    expect(
      schemaVaultsApiServerDefinitionSchema.safeParse({
        ...base,
        resource_url_match_mode: "regex",
      }).success,
    ).toBe(false);
  });
});
