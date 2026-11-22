import { describe, expect, test } from "bun:test";
import type { ISchemaVaultsAuthClientAdapter } from "@/types/ISchemaVaultsAuthClientAdapter";
import {
  listApiServerDomainVerifications,
  verifyApiServerDomain,
} from "./api-server-domain-verification";

const AUTH_SERVER = "https://auth.example.com";
const API_SERVER_ID = "notes-mcp";
const REF = "6f1c1f4e-8a39-4c43-9b3e-2f0d6a1d6a10";

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

const PENDING = {
  api_server_domain_ref_id: REF,
  verified: false,
  verified_at: null,
  verification_method: null,
  dns_txt_record: {
    name: "_auth-domain-verification.api.example.com",
    value: "auth-domain-verification=0123456789abcdef0123456789abcdef",
  },
} as const;

const VERIFIED = {
  ...PENDING,
  verified: true,
  verified_at: 1_700_000_000_000,
  verification_method: "dns_txt",
} as const;

describe("verifyApiServerDomain", () => {
  test("POSTs the method and returns a verified attempt", async () => {
    const capture: Capture = { calls: [] };
    const attempt = await verifyApiServerDomain({
      adapter: adapterReturning(
        200,
        { success: true, message: "The domain is verified", verification: VERIFIED },
        capture,
      ),
      auth_server_uri: AUTH_SERVER,
      api_server_id: API_SERVER_ID,
      api_server_domain_ref_id: REF,
      method: "dns_txt",
    });
    expect(attempt).toEqual({
      verified: true,
      message: "The domain is verified",
      verification: VERIFIED,
    });
    expect(capture.calls[0]!.url).toBe(
      `${AUTH_SERVER}/api/apis/${API_SERVER_ID}/domains/${REF}/verify`,
    );
    expect(capture.calls[0]!.init?.method).toBe("POST");
    expect(JSON.parse(String(capture.calls[0]!.init?.body))).toEqual({ method: "dns_txt" });
  });

  test("returns an unverified attempt with its reason instead of throwing", async () => {
    for (const [status, error] of [
      [422, "verification_record_not_found"],
      [422, "domain_not_dns_verifiable"],
      [503, "dns_lookup_failed"],
    ] as const) {
      const attempt = await verifyApiServerDomain({
        adapter: adapterReturning(status, {
          success: false,
          error,
          message: "Not yet",
          verification: PENDING,
        }),
        auth_server_uri: AUTH_SERVER,
        api_server_id: API_SERVER_ID,
        api_server_domain_ref_id: REF,
      });
      expect(attempt).toEqual({ verified: false, error, message: "Not yet", verification: PENDING });
    }
  });

  test("throws refusals with the server's message", async () => {
    await expect(
      verifyApiServerDomain({
        adapter: adapterReturning(403, { success: false, message: "Managers only" }),
        auth_server_uri: AUTH_SERVER,
        api_server_id: API_SERVER_ID,
        api_server_domain_ref_id: REF,
      }),
    ).rejects.toThrow("Managers only");
  });

  test("rejects a malformed ref id before sending anything", async () => {
    const capture: Capture = { calls: [] };
    await expect(
      verifyApiServerDomain({
        adapter: adapterReturning(200, {}, capture),
        auth_server_uri: AUTH_SERVER,
        api_server_id: API_SERVER_ID,
        api_server_domain_ref_id: "../../other",
      }),
    ).rejects.toThrow();
    expect(capture.calls).toHaveLength(0);
  });
});

describe("listApiServerDomainVerifications", () => {
  test("returns the verifications listed beside the domains", async () => {
    const verifications = await listApiServerDomainVerifications({
      adapter: adapterReturning(200, {
        success: true,
        message: "Domains successfully listed",
        list: [],
        verifications: [PENDING, VERIFIED],
      }),
      auth_server_uri: AUTH_SERVER,
      api_server_id: API_SERVER_ID,
    });
    expect(verifications).toEqual([PENDING, VERIFIED]);
  });

  test("refuses a response from a server that does not report verifications", async () => {
    await expect(
      listApiServerDomainVerifications({
        adapter: adapterReturning(200, { success: true, message: "", list: [] }),
        auth_server_uri: AUTH_SERVER,
        api_server_id: API_SERVER_ID,
      }),
    ).rejects.toThrow("malformed");
  });
});
