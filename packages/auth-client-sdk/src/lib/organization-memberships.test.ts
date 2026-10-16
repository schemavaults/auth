import { describe, expect, test } from "bun:test";
import type { ISchemaVaultsAuthClientAdapter } from "@/types/ISchemaVaultsAuthClientAdapter";
import {
  listMyOrganizationMemberships,
  MyOrganizationMembershipsUnavailableError,
} from "./list-my-organization-memberships";
import { setApiServerOrganizationMembershipVisibility } from "./set-api-server-organization-membership-visibility";

const AUTH_SERVER = "https://auth.example.com";
const API_SERVER_ID = "registry-api";

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

const MEMBERSHIP = {
  organization_id: "acme",
  organization_name: "Acme",
  role: "owner",
  created_at: 1_700_000_000_000,
  joined_at: 1_700_000_000_001,
} as const;

describe("listMyOrganizationMemberships", () => {
  test("on the auth server, sends a credentialed same-origin request", async () => {
    const capture: Capture = { calls: [] };
    const memberships = await listMyOrganizationMemberships({
      adapter: adapterReturning(
        200,
        { success: true, message: "ok", data: { memberships: [MEMBERSHIP] } },
        capture,
      ),
      auth_server_uri: AUTH_SERVER,
      is_auth_server: true,
    });
    expect(memberships).toEqual([MEMBERSHIP]);
    expect(capture.calls).toHaveLength(1);
    expect(capture.calls[0]!.url).toBe(`${AUTH_SERVER}/api/me/organizations`);
    expect(capture.calls[0]!.init?.credentials).toBe("include");
  });

  test("on any other app, rejects without contacting the auth server", async () => {
    const capture: Capture = { calls: [] };
    const promise = listMyOrganizationMemberships({
      adapter: adapterReturning(200, {}, capture),
      auth_server_uri: AUTH_SERVER,
      is_auth_server: false,
    });
    await expect(promise).rejects.toBeInstanceOf(MyOrganizationMembershipsUnavailableError);
    await expect(promise).rejects.toThrow("listUserOrganizations()");
    expect(capture.calls).toHaveLength(0);
  });
});

describe("setApiServerOrganizationMembershipVisibility", () => {
  const API_SERVER = {
    api_server_id: API_SERVER_ID,
    api_server_name: "Registry",
    api_server_description: "",
    created_at: 1,
    public: false,
    hardcoded: false,
    organization_membership_visibility: "all_organizations",
  } as const;

  test("PUTs the visibility and returns the updated API server", async () => {
    const capture: Capture = { calls: [] };
    const updated = await setApiServerOrganizationMembershipVisibility({
      adapter: adapterReturning(200, { success: true, api_server: API_SERVER }, capture),
      auth_server_uri: AUTH_SERVER,
      api_server_id: API_SERVER_ID,
      organization_membership_visibility: "all_organizations",
    });
    expect(updated.organization_membership_visibility).toBe("all_organizations");
    expect(capture.calls[0]!.url).toBe(
      `${AUTH_SERVER}/api/apis/${API_SERVER_ID}/organization-membership-visibility`,
    );
    expect(capture.calls[0]!.init?.method).toBe("PUT");
    expect(JSON.parse(String(capture.calls[0]!.init?.body))).toEqual({
      organization_membership_visibility: "all_organizations",
    });
  });

  test("surfaces the server's message on failure", async () => {
    await expect(
      setApiServerOrganizationMembershipVisibility({
        adapter: adapterReturning(403, { success: false, message: "Admins only" }),
        auth_server_uri: AUTH_SERVER,
        api_server_id: API_SERVER_ID,
        organization_membership_visibility: "all_organizations",
      }),
    ).rejects.toThrow("Admins only");
  });

  test("rejects an unknown visibility before sending anything", async () => {
    const capture: Capture = { calls: [] };
    await expect(
      setApiServerOrganizationMembershipVisibility({
        adapter: adapterReturning(200, {}, capture),
        auth_server_uri: AUTH_SERVER,
        api_server_id: API_SERVER_ID,
        organization_membership_visibility: "everyone" as never,
      }),
    ).rejects.toThrow();
    expect(capture.calls).toHaveLength(0);
  });
});
