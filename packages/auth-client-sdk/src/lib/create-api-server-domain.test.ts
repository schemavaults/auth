import { describe, expect, test } from "bun:test";
import type { ISchemaVaultsAuthClientAdapter } from "@/types/ISchemaVaultsAuthClientAdapter";
import type { SchemaVaultsApiServerDomainRef } from "@schemavaults/app-definitions";
import { createApiServerDomain } from "./create-api-server-domain";

const AUTH_SERVER = "https://auth.example.com";

const DOMAIN: SchemaVaultsApiServerDomainRef = {
  api_server_domain_ref_id: "6f1c1f4e-8a39-4c43-9b3e-2f0d6a1d6a10",
  api_server_id: "notes-api",
  domain: "https://www.example.com",
  environment: "production",
  created_at: 1,
  hardcoded: false,
};

function adapterAnswering(response: Response): ISchemaVaultsAuthClientAdapter {
  return {
    fetch: async (): Promise<Response> => response,
  } as unknown as ISchemaVaultsAuthClientAdapter;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("createApiServerDomain", () => {
  test("resolves when the server accepts the domain", async () => {
    await createApiServerDomain({
      adapter: adapterAnswering(
        jsonResponse(200, { success: true, message: "ok", resource_id: DOMAIN.api_server_id }),
      ),
      auth_server_uri: AUTH_SERVER,
      api_server_domain_definition: DOMAIN,
    });
  });

  test("throws the server's message for a refused domain (e.g. a 409 conflict)", async () => {
    const message =
      '"https://www.example.com" is already registered for this API server in the production environment.';
    await expect(
      createApiServerDomain({
        adapter: adapterAnswering(jsonResponse(409, { success: false, message })),
        auth_server_uri: AUTH_SERVER,
        api_server_domain_definition: DOMAIN,
      }),
    ).rejects.toThrow(message);
  });

  test("falls back to the status code when the error body has no message", async () => {
    await expect(
      createApiServerDomain({
        adapter: adapterAnswering(new Response("Bad gateway", { status: 502 })),
        auth_server_uri: AUTH_SERVER,
        api_server_domain_definition: DOMAIN,
      }),
    ).rejects.toThrow("Failed to create API server domain: 502");
  });
});
