import { describe, expect, test } from "bun:test";
import { appIdSchema } from "@schemavaults/app-definitions";
import type { ParsedDynamicClientMetadata } from "@schemavaults/auth-common";
import {
  buildDynamicClientRegistrationResponse,
  DYNAMIC_CLIENT_ID_PREFIX,
  generateDynamicClientId,
  isDynamicClientId,
} from "./register-dynamic-client";

const METADATA: ParsedDynamicClientMetadata = {
  redirect_uris: ["http://127.0.0.1:41234/callback"],
  client_name: "Example MCP Client",
  token_endpoint_auth_method: "none",
  grant_types: ["authorization_code", "refresh_token"],
  response_types: ["code"],
  client_uri: "https://client.example.com",
  logo_uri: null,
  tos_uri: null,
  policy_uri: null,
  contacts: ["ops@example.com"],
  scope: "mcp:tools",
  software_id: "example-mcp-client",
  software_version: null,
};

describe("generateDynamicClientId", () => {
  test("produces prefixed ids that satisfy the app id schema", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const id = generateDynamicClientId();
      expect(id.startsWith(DYNAMIC_CLIENT_ID_PREFIX)).toBe(true);
      expect(appIdSchema.safeParse(id).success).toBe(true);
      expect(isDynamicClientId(id)).toBe(true);
      seen.add(id);
    }
    expect(seen.size).toBe(20);
    expect(isDynamicClientId("my-console-app")).toBe(false);
  });
});

describe("buildDynamicClientRegistrationResponse", () => {
  test("omits the secret for public clients and drops absent optional members", () => {
    const body = buildDynamicClientRegistrationResponse({
      client_id: "dcr-abc",
      client_secret: null,
      client_id_issued_at: 1700000000,
      metadata: METADATA,
    });
    expect(body).toEqual({
      client_id: "dcr-abc",
      client_id_issued_at: 1700000000,
      redirect_uris: ["http://127.0.0.1:41234/callback"],
      client_name: "Example MCP Client",
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      client_uri: "https://client.example.com",
      contacts: ["ops@example.com"],
      scope: "mcp:tools",
      software_id: "example-mcp-client",
    });
    expect("client_secret" in body).toBe(false);
    expect("logo_uri" in body).toBe(false);
  });

  test("includes a non-expiring secret for confidential clients", () => {
    const body = buildDynamicClientRegistrationResponse({
      client_id: "dcr-abc",
      client_secret: "svs_secret",
      client_id_issued_at: 1700000000,
      metadata: { ...METADATA, token_endpoint_auth_method: "client_secret_basic" },
    });
    expect(body.client_secret).toBe("svs_secret");
    expect(body.client_secret_expires_at).toBe(0);
    expect(body.token_endpoint_auth_method).toBe("client_secret_basic");
  });
});
