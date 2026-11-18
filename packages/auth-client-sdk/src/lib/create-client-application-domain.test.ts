import { describe, expect, test } from "bun:test";
import type { ISchemaVaultsAuthClientAdapter } from "@/types/ISchemaVaultsAuthClientAdapter";
import type { SchemaVaultsAppDomainRef } from "@schemavaults/app-definitions";
import { createClientApplicationDomain } from "./create-client-application-domain";

const AUTH_SERVER = "https://auth.example.com";

const DOMAIN: SchemaVaultsAppDomainRef = {
  app_domain_ref_id: "6f1c1f4e-8a39-4c43-9b3e-2f0d6a1d6a10",
  app_id: "notes-app",
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

describe("createClientApplicationDomain", () => {
  test("resolves when the server accepts the domain", async () => {
    await createClientApplicationDomain({
      adapter: adapterAnswering(
        jsonResponse(200, { success: true, message: "ok", resource_id: DOMAIN.app_id }),
      ),
      auth_server_uri: AUTH_SERVER,
      app_domain_definition: DOMAIN,
    });
  });

  test("throws the server's message for a refused domain (e.g. a 409 conflict)", async () => {
    const message =
      '"https://www.example.com" is already registered for this app in the production environment.';
    await expect(
      createClientApplicationDomain({
        adapter: adapterAnswering(jsonResponse(409, { success: false, message })),
        auth_server_uri: AUTH_SERVER,
        app_domain_definition: DOMAIN,
      }),
    ).rejects.toThrow(message);
  });

  test("falls back to the status code when the error body has no message", async () => {
    await expect(
      createClientApplicationDomain({
        adapter: adapterAnswering(new Response("Bad gateway", { status: 502 })),
        auth_server_uri: AUTH_SERVER,
        app_domain_definition: DOMAIN,
      }),
    ).rejects.toThrow("Failed to create client application domain: 502");
  });
});
