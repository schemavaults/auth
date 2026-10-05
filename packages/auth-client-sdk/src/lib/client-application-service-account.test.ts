import { describe, expect, test } from "bun:test";
import type { ISchemaVaultsAuthClientAdapter } from "@/types/ISchemaVaultsAuthClientAdapter";
import {
  deleteClientApplicationServiceAccountOrganizationMembership,
  getClientApplicationServiceAccount,
  setClientApplicationServiceAccountOrganizationMembership,
} from "./client-application-service-account";

const AUTH_SERVER = "https://auth.example.com";
const APP_ID = "my-org-app";

type FetchInit = Parameters<ISchemaVaultsAuthClientAdapter["fetch"]>[1];

interface Capture {
  url?: string;
  init?: FetchInit;
}

function adapterReturning(
  status: number,
  body: unknown,
  capture: Capture = {},
): ISchemaVaultsAuthClientAdapter {
  return {
    fetch: async (url: string, init: FetchInit): Promise<Response> => {
      capture.url = url;
      capture.init = init;
      return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    },
  } as unknown as ISchemaVaultsAuthClientAdapter;
}

const SERVICE_ACCOUNT = {
  uid: "6f1b6a8e-7c1d-4d55-9a53-0f4f4b8f2d11",
  email: `${APP_ID}@service-accounts.invalid`,
  created_at: 1700000000000,
  disabled: false,
};

describe("getClientApplicationServiceAccount", () => {
  test("parses the organization membership", async () => {
    const status = await getClientApplicationServiceAccount({
      adapter: adapterReturning(200, {
        success: true,
        service_account: SERVICE_ACCOUNT,
        has_client_secret: true,
        organization_membership: { available: true, organization_id: "acme", role: "member" },
      }),
      auth_server_uri: AUTH_SERVER,
      app_id: APP_ID,
    });
    expect(status.service_account).toEqual(SERVICE_ACCOUNT);
    expect(status.organization_membership).toEqual({
      available: true,
      organization_id: "acme",
      role: "member",
    });
  });

  test("reports a null organization membership for auth servers that predate it", async () => {
    const status = await getClientApplicationServiceAccount({
      adapter: adapterReturning(200, {
        success: true,
        service_account: null,
        has_client_secret: false,
      }),
      auth_server_uri: AUTH_SERVER,
      app_id: APP_ID,
    });
    expect(status.organization_membership).toBeNull();
  });
});

describe("setClientApplicationServiceAccountOrganizationMembership", () => {
  test("PUTs the role (default member) and returns the updated membership", async () => {
    const capture: Capture = {};
    const result = await setClientApplicationServiceAccountOrganizationMembership({
      adapter: adapterReturning(
        200,
        {
          success: true,
          message: "The app's service account is now a member of organization 'acme'.",
          organization_membership: { available: true, organization_id: "acme", role: "member" },
        },
        capture,
      ),
      auth_server_uri: AUTH_SERVER,
      app_id: APP_ID,
    });
    expect(capture.url).toBe(
      `${AUTH_SERVER}/api/apps/${APP_ID}/service-account/organization-membership`,
    );
    expect(capture.init?.method).toBe("PUT");
    expect(capture.init?.credentials).toBe("include");
    expect(JSON.parse(String(capture.init?.body))).toEqual({ role: "member" });
    expect(result.organization_membership.role).toBe("member");
    expect(result.message).toContain("acme");
  });

  test("sends an explicit owner role", async () => {
    const capture: Capture = {};
    await setClientApplicationServiceAccountOrganizationMembership({
      adapter: adapterReturning(
        200,
        {
          success: true,
          message: "ok",
          organization_membership: { available: true, organization_id: "acme", role: "owner" },
        },
        capture,
      ),
      auth_server_uri: AUTH_SERVER,
      app_id: APP_ID,
      role: "owner",
    });
    expect(JSON.parse(String(capture.init?.body))).toEqual({ role: "owner" });
  });

  test("refuses roles that cannot be assigned without calling the server", async () => {
    const capture: Capture = {};
    await expect(
      setClientApplicationServiceAccountOrganizationMembership({
        adapter: adapterReturning(200, {}, capture),
        auth_server_uri: AUTH_SERVER,
        app_id: APP_ID,
        role: "admin" as unknown as "member",
      }),
    ).rejects.toThrow(TypeError);
    expect(capture.url).toBeUndefined();
  });

  test("surfaces the server's refusal message", async () => {
    await expect(
      setClientApplicationServiceAccountOrganizationMembership({
        adapter: adapterReturning(409, {
          success: false,
          message: "this app is not owned by one.",
        }),
        auth_server_uri: AUTH_SERVER,
        app_id: APP_ID,
      }),
    ).rejects.toThrow("this app is not owned by one.");
  });
});

describe("deleteClientApplicationServiceAccountOrganizationMembership", () => {
  test("DELETEs the membership and returns the updated state", async () => {
    const capture: Capture = {};
    const result = await deleteClientApplicationServiceAccountOrganizationMembership({
      adapter: adapterReturning(
        200,
        {
          success: true,
          message: "removed",
          organization_membership: { available: true, organization_id: "acme", role: null },
        },
        capture,
      ),
      auth_server_uri: AUTH_SERVER,
      app_id: APP_ID,
    });
    expect(capture.init?.method).toBe("DELETE");
    expect(result.organization_membership).toEqual({
      available: true,
      organization_id: "acme",
      role: null,
    });
  });
});
