import { describe, expect, test } from "bun:test";
import type { ISchemaVaultsAuthClientAdapter } from "@/types/ISchemaVaultsAuthClientAdapter";
import { setApiServerDelegatedTokenPolicy } from "./set-api-server-delegated-token-policy";

const AUTH_SERVER = "https://auth.example.com";
const API_SERVER_ID = "notes-mcp";

type FetchInit = Parameters<ISchemaVaultsAuthClientAdapter["fetch"]>[1];

interface Capture {
  calls: { url: string; init: FetchInit }[];
}

function adapterReturning(
  status: number,
  body: unknown,
  capture: Capture = { calls: [] },
): ISchemaVaultsAuthClientAdapter {
  return {
    fetch: async (url: string, init: FetchInit): Promise<Response> => {
      capture.calls.push({ url, init });
      return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    },
  } as unknown as ISchemaVaultsAuthClientAdapter;
}

const API_SERVER = {
  api_server_id: API_SERVER_ID,
  api_server_name: "Notes MCP",
  api_server_description: "",
  created_at: 1,
  public: false,
  hardcoded: false,
  accept_delegated_tokens: true,
} as const;

describe("setApiServerDelegatedTokenPolicy", () => {
  test("PUTs the policy and returns the updated API server", async () => {
    const capture: Capture = { calls: [] };
    const updated = await setApiServerDelegatedTokenPolicy({
      adapter: adapterReturning(200, { success: true, api_server: API_SERVER }, capture),
      auth_server_uri: AUTH_SERVER,
      api_server_id: API_SERVER_ID,
      accept_delegated_tokens: true,
    });
    expect(updated.accept_delegated_tokens).toBe(true);
    expect(capture.calls).toHaveLength(1);
    expect(capture.calls[0]!.url).toBe(
      `${AUTH_SERVER}/api/apis/${API_SERVER_ID}/delegated-token-policy`,
    );
    expect(capture.calls[0]!.init?.method).toBe("PUT");
    expect(JSON.parse(String(capture.calls[0]!.init?.body))).toEqual({
      accept_delegated_tokens: true,
    });
  });

  test("surfaces the server's message on failure", async () => {
    await expect(
      setApiServerDelegatedTokenPolicy({
        adapter: adapterReturning(403, { success: false, message: "Managers only" }),
        auth_server_uri: AUTH_SERVER,
        api_server_id: API_SERVER_ID,
        accept_delegated_tokens: true,
      }),
    ).rejects.toThrow("Managers only");
  });

  test("rejects a non-boolean policy before sending anything", async () => {
    const capture: Capture = { calls: [] };
    await expect(
      setApiServerDelegatedTokenPolicy({
        adapter: adapterReturning(200, { success: true, api_server: API_SERVER }, capture),
        auth_server_uri: AUTH_SERVER,
        api_server_id: API_SERVER_ID,
        accept_delegated_tokens: "yes" as unknown as boolean,
      }),
    ).rejects.toThrow();
    expect(capture.calls).toHaveLength(0);
  });

  test("refuses a malformed response", async () => {
    await expect(
      setApiServerDelegatedTokenPolicy({
        adapter: adapterReturning(200, { success: true, api_server: { api_server_id: API_SERVER_ID } }),
        auth_server_uri: AUTH_SERVER,
        api_server_id: API_SERVER_ID,
        accept_delegated_tokens: false,
      }),
    ).rejects.toThrow("malformed");
  });
});
