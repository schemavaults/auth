import { describe, expect, test } from "bun:test";
import type { ISchemaVaultsAuthClientAdapter } from "@/types/ISchemaVaultsAuthClientAdapter";
import {
  listMyConnectedApps,
  revokeClientApplicationAuthorization,
  revokeMyAppScopeConsent,
} from "./connected-apps";

const AUTH_SERVER = "https://auth.example.com";
const SCOPE_ID = "6f1c1f4e-8a39-4c43-9b3e-2f0d6a1d6a10";

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

const CONNECTED_APP = {
  app_id: "notes-web",
  app_name: "Notes",
  app_description: "",
  authorized_at: 1_700_000_000_000,
  last_used_at: null,
  api_scopes: [
    {
      api_server_id: "notes-api",
      api_server_name: "Notes API",
      api_server_scope_id: SCOPE_ID,
      scope: "notes:read",
      description: "Read your notes",
      granted_at: 1_700_000_000_000,
    },
  ],
};

describe("listMyConnectedApps", () => {
  test("sends a credentialed request and parses the list", async () => {
    const capture: Capture = { calls: [] };
    const list = await listMyConnectedApps({
      adapter: adapterReturning(200, { success: true, list: [CONNECTED_APP] }, capture),
      auth_server_uri: AUTH_SERVER,
      is_auth_server: true,
    });
    expect(list).toEqual([CONNECTED_APP]);
    expect(capture.calls[0]!.url).toBe(`${AUTH_SERVER}/api/me/connected-apps`);
    expect(capture.calls[0]!.init?.credentials).toBe("include");
  });

  test("rejects on other apps without contacting the auth server", async () => {
    const capture: Capture = { calls: [] };
    await expect(
      listMyConnectedApps({
        adapter: adapterReturning(200, { success: true, list: [] }, capture),
        auth_server_uri: AUTH_SERVER,
        is_auth_server: false,
      }),
    ).rejects.toThrow(/only available on the auth server/);
    expect(capture.calls).toHaveLength(0);
  });

  test("surfaces the server's failure message", async () => {
    await expect(
      listMyConnectedApps({
        adapter: adapterReturning(401, { success: false, message: "Not signed in" }),
        auth_server_uri: AUTH_SERVER,
        is_auth_server: true,
      }),
    ).rejects.toThrow(/Not signed in/);
  });
});

describe("revokeMyAppScopeConsent", () => {
  test("sends DELETE to the scope's path", async () => {
    const capture: Capture = { calls: [] };
    const result = await revokeMyAppScopeConsent({
      adapter: adapterReturning(
        200,
        { success: true, message: "ok", was_granted: true, revoked_token_count: 2 },
        capture,
      ),
      auth_server_uri: AUTH_SERVER,
      is_auth_server: true,
      app_id: "notes-web",
      api_server_scope_id: SCOPE_ID,
    });
    expect(result).toEqual({ was_granted: true, revoked_token_count: 2 });
    expect(capture.calls[0]!.url).toBe(
      `${AUTH_SERVER}/api/me/connected-apps/notes-web/scopes/${SCOPE_ID}`,
    );
    expect(capture.calls[0]!.init?.method).toBe("DELETE");
  });

  test("rejects a malformed scope id without a request", async () => {
    const capture: Capture = { calls: [] };
    await expect(
      revokeMyAppScopeConsent({
        adapter: adapterReturning(200, {}, capture),
        auth_server_uri: AUTH_SERVER,
        is_auth_server: true,
        app_id: "notes-web",
        api_server_scope_id: "not-a-uuid",
      }),
    ).rejects.toThrow();
    expect(capture.calls).toHaveLength(0);
  });
});

describe("revokeClientApplicationAuthorization", () => {
  test("sends DELETE /api/apps/{app_id}/authorize", async () => {
    const capture: Capture = { calls: [] };
    const result = await revokeClientApplicationAuthorization({
      adapter: adapterReturning(
        200,
        {
          success: true,
          message: "ok",
          resource_id: "notes-web",
          was_authorized: true,
          revoked_token_count: 3,
        },
        capture,
      ),
      auth_server_uri: AUTH_SERVER,
      is_auth_server: true,
      app_id: "notes-web",
    });
    expect(result).toEqual({ was_authorized: true, revoked_token_count: 3 });
    expect(capture.calls[0]!.url).toBe(`${AUTH_SERVER}/api/apps/notes-web/authorize`);
    expect(capture.calls[0]!.init?.method).toBe("DELETE");
  });
});
