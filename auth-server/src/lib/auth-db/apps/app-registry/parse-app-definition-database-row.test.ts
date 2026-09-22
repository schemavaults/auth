import { describe, expect, test } from "bun:test";
import parseAppDefinitionDatabaseRow, {
  normalizeAppDatabaseRow,
} from "./parse-app-definition-database-row";

// node-postgres returns BIGINT columns as strings; JSONB columns come back
// parsed. A dynamically registered client's row exercises both.
const DYNAMIC_CLIENT_ROW = {
  app_id: "dcr-2f0b2c5e-6f0e-4a2b-9d9c-1e2f3a4b5c6d",
  app_name: "Example MCP Client",
  app_description: "Registered through OAuth 2.0 dynamic client registration (RFC 7591).",
  created_at: "1758556000000",
  public: false,
  hardcoded: false,
  web: true,
  owner_type: "dynamic-client-registration",
  owner_organization_id: null,
  owner_uid: null,
  created_by: null,
  client_uri: "https://client.example.com",
  logo_uri: null,
  tos_uri: null,
  policy_uri: null,
  contacts: ["ops@example.com"],
  grant_types: ["authorization_code", "refresh_token"],
  response_types: ["code"],
  token_endpoint_auth_method: "none",
  software_id: null,
  software_version: null,
  registered_scope: "mcp:tools",
  client_id_issued_at: "1758556000",
};

describe("normalizeAppDatabaseRow", () => {
  test("coerces the BIGINT columns from their string form", () => {
    const row = normalizeAppDatabaseRow(DYNAMIC_CLIENT_ROW);
    expect(row.created_at).toBe(1758556000000);
    expect(row.client_id_issued_at).toBe(1758556000);
  });

  test("keeps NULL / numeric values as they are", () => {
    expect(
      normalizeAppDatabaseRow({ ...DYNAMIC_CLIENT_ROW, client_id_issued_at: null })
        .client_id_issued_at,
    ).toBeNull();
    expect(
      normalizeAppDatabaseRow({ ...DYNAMIC_CLIENT_ROW, client_id_issued_at: 42 })
        .client_id_issued_at,
    ).toBe(42);
    const without = { ...DYNAMIC_CLIENT_ROW } as Record<string, unknown>;
    delete without.client_id_issued_at;
    expect("client_id_issued_at" in normalizeAppDatabaseRow(without)).toBe(false);
  });

  test("rejects a malformed timestamp", () => {
    expect(() =>
      normalizeAppDatabaseRow({ ...DYNAMIC_CLIENT_ROW, created_at: "soon" }),
    ).toThrow();
    expect(() =>
      normalizeAppDatabaseRow({ ...DYNAMIC_CLIENT_ROW, client_id_issued_at: "later" }),
    ).toThrow();
  });
});

describe("parseAppDefinitionDatabaseRow", () => {
  test("parses a dynamically registered client's row", () => {
    const app = parseAppDefinitionDatabaseRow(DYNAMIC_CLIENT_ROW);
    expect(app.app_id).toBe(DYNAMIC_CLIENT_ROW.app_id);
    expect(app.owner_type).toBe("dynamic-client-registration");
    expect(app.created_at).toBe(1758556000000);
    expect(app.client_id_issued_at).toBe(1758556000);
    expect(app.contacts).toEqual(["ops@example.com"]);
    expect(app.grant_types).toEqual(["authorization_code", "refresh_token"]);
    expect(app.token_endpoint_auth_method).toBe("none");
  });

  test("parses a console-created app row whose metadata columns are NULL", () => {
    const app = parseAppDefinitionDatabaseRow({
      app_id: "my-console-app",
      app_name: "Console app",
      app_description: "",
      created_at: "1758556000000",
      public: true,
      hardcoded: false,
      web: true,
      owner_type: "platform",
      owner_organization_id: null,
      owner_uid: null,
      created_by: null,
      client_uri: null,
      logo_uri: null,
      tos_uri: null,
      policy_uri: null,
      contacts: null,
      grant_types: null,
      response_types: null,
      token_endpoint_auth_method: null,
      software_id: null,
      software_version: null,
      registered_scope: null,
      client_id_issued_at: null,
    });
    expect(app.owner_type).toBe("platform");
    expect(app.client_id_issued_at).toBeNull();
  });
});
