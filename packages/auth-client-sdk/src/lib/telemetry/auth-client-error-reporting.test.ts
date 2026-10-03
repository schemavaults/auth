import { describe, expect, test } from "bun:test";
import { SchemaVaultsAuthClient } from "@/auth-client";
import type { ISchemaVaultsAuthClientAdapter } from "@/types/ISchemaVaultsAuthClientAdapter";

/** `RequestInit | undefined`, as the adapter's fetch takes it. */
type FetchInit = Parameters<ISchemaVaultsAuthClientAdapter["fetch"]>[1];

const AUTH_SERVER_URL = "https://auth.example.com";
const REFRESH_TOKEN = {
  type: "refresh",
  token: "opaque-refresh-token",
  expiry: Date.now() + 60 * 60 * 1000,
} as const;

/** Every request the client made, with a whoami endpoint that always fails. */
function createClient(options: { disable_telemetry?: boolean; signedIn: boolean }) {
  const requests: { url: string; init: FetchInit }[] = [];
  const adapter = {
    fetch: async (url: string, init: FetchInit): Promise<Response> => {
      requests.push({ url, init });
      if (url.includes("/api/client-errors/")) return new Response(null, { status: 202 });
      return new Response("upstream failure", { status: 502 });
    },
    relativeUrlToAbsoluteUrl: (relative: string): string => new URL(relative, "https://app.example.com").toString(),
    hasRefreshToken: (): boolean => options.signedIn,
    getRefreshToken: () => (options.signedIn ? REFRESH_TOKEN : null),
    doesSupportHttpOnlyRefreshToken: (): boolean => false,
    getUserData: () => null,
    getAccessToken: () => null,
    uuid: (): string => crypto.randomUUID(),
  } as unknown as ISchemaVaultsAuthClientAdapter;

  const client = new SchemaVaultsAuthClient({
    adapter,
    auth_server_url: AUTH_SERVER_URL,
    successful_authentication_redirect_uri: "https://app.example.com/account",
    app_id: "my-web-app",
    app_env: "production",
    debug: false,
    disable_telemetry: options.disable_telemetry,
  });
  const reports = () => requests.filter((request) => request.url.includes("/api/client-errors/"));
  return { client, reports };
}

/** Lets the fire-and-forget report go out. */
async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("SchemaVaultsAuthClient error reporting", () => {
  test("reports a failed session check to the auth server", async () => {
    const { client, reports } = createClient({ signedIn: true });
    expect(client.telemetryEnabled).toBe(true);
    await expect(client.checkIfAuthenticatedWithServer()).rejects.toThrow("whoami");
    await flush();
    expect(reports()).toHaveLength(1);
    expect(reports()[0]!.url).toBe(`${AUTH_SERVER_URL}/api/client-errors/my-web-app`);
    expect(JSON.parse(String(reports()[0]!.init?.body))).toMatchObject({
      name: "Error",
      operation: "checkIfAuthenticatedWithServer",
      sdk_name: "@schemavaults/auth-client-sdk",
      sdk_version: client.version,
      app_env: "production",
    });
  });

  test("sends nothing with disable_telemetry", async () => {
    const { client, reports } = createClient({ signedIn: true, disable_telemetry: true });
    expect(client.telemetryEnabled).toBe(false);
    await expect(client.checkIfAuthenticatedWithServer()).rejects.toThrow();
    client.reportError(new Error("app error"));
    await flush();
    expect(reports()).toHaveLength(0);
  });

  test("does not report expected session errors", async () => {
    const { client, reports } = createClient({ signedIn: false });
    await expect(client.acquireAccessToken({ audience: "my-api" })).rejects.toThrow("No refresh token available");
    await flush();
    expect(reports()).toHaveLength(0);
  });

  test("reportError sends the app's own errors with their context", async () => {
    const { client, reports } = createClient({ signedIn: false });
    client.reportError(new RangeError("cart total negative"), { operation: "checkout", context: { items: 3 } });
    await flush();
    expect(reports()).toHaveLength(1);
    expect(JSON.parse(String(reports()[0]!.init?.body))).toMatchObject({
      name: "RangeError",
      message: "cart total negative",
      operation: "checkout",
      context: { items: 3 },
    });
  });

  test("refuses a non-boolean disable_telemetry", () => {
    expect(
      () =>
        new SchemaVaultsAuthClient({
          adapter: {} as ISchemaVaultsAuthClientAdapter,
          auth_server_url: AUTH_SERVER_URL,
          successful_authentication_redirect_uri: "https://app.example.com/account",
          app_id: "my-web-app",
          app_env: "production",
          disable_telemetry: "yes" as unknown as boolean,
        }),
    ).toThrow("disable_telemetry");
  });
});
