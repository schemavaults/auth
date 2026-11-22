import { describe, expect, test } from "bun:test";
import type { ISchemaVaultsAuthClientAdapter } from "@/types/ISchemaVaultsAuthClientAdapter";
import { AppAlreadyConnectedToApiServerError } from "@schemavaults/auth-common";
import { connectAppToApiServer } from "./connect-app-to-api-server";

const AUTH_SERVER = "https://auth.example.com";
const API_SERVER_ID = "notes-api";
const CLIENT_APP_ID = "notes-web";
const URL = `${AUTH_SERVER}/api/apis/${API_SERVER_ID}/connect_app/${CLIENT_APP_ID}`;

type FetchInit = Parameters<typeof fetch>[1];

interface RecordedRequest {
  url: string;
  init: FetchInit;
}

function recordingAdapter(response: Response): {
  adapter: ISchemaVaultsAuthClientAdapter;
  requests: RecordedRequest[];
} {
  const requests: RecordedRequest[] = [];
  const adapter = {
    fetch: async (url: string, init?: FetchInit): Promise<Response> => {
      requests.push({ url, init });
      return response;
    },
  } as unknown as ISchemaVaultsAuthClientAdapter;
  return { adapter, requests };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const CONNECTED = {
  success: true,
  message: "Successfully conected frontend application to API server",
  resource_id: API_SERVER_ID,
};

describe("connectAppToApiServer", () => {
  test("sends no body without the first-party flag (what older auth servers expect)", async () => {
    const { adapter, requests } = recordingAdapter(
      jsonResponse(200, { ...CONNECTED, first_party: false }),
    );
    await connectAppToApiServer({
      adapter,
      auth_server_uri: AUTH_SERVER,
      api_server_id: API_SERVER_ID,
      client_app_id: CLIENT_APP_ID,
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe(URL);
    expect(requests[0]?.init?.method).toBe("POST");
    expect(requests[0]?.init?.body).toBeUndefined();
    expect(requests[0]?.init?.headers).toBeUndefined();
  });

  test("sends no body for first_party: false", async () => {
    const { adapter, requests } = recordingAdapter(
      jsonResponse(200, { ...CONNECTED, first_party: false }),
    );
    await connectAppToApiServer({
      adapter,
      auth_server_uri: AUTH_SERVER,
      api_server_id: API_SERVER_ID,
      client_app_id: CLIENT_APP_ID,
      first_party: false,
    });
    expect(requests[0]?.init?.body).toBeUndefined();
  });

  test("sends { first_party: true } as JSON when asked to mark the connection first-party", async () => {
    const { adapter, requests } = recordingAdapter(
      jsonResponse(200, { ...CONNECTED, first_party: true }),
    );
    await connectAppToApiServer({
      adapter,
      auth_server_uri: AUTH_SERVER,
      api_server_id: API_SERVER_ID,
      client_app_id: CLIENT_APP_ID,
      first_party: true,
    });
    expect(requests[0]?.url).toBe(URL);
    expect(requests[0]?.init?.method).toBe("POST");
    expect(requests[0]?.init?.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(String(requests[0]?.init?.body))).toEqual({ first_party: true });
  });

  test("maps 409 to AppAlreadyConnectedToApiServerError", async () => {
    const { adapter } = recordingAdapter(
      jsonResponse(409, { success: false, message: "This app is already connected to this API server" }),
    );
    await expect(
      connectAppToApiServer({
        adapter,
        auth_server_uri: AUTH_SERVER,
        api_server_id: API_SERVER_ID,
        client_app_id: CLIENT_APP_ID,
        first_party: true,
      }),
    ).rejects.toBeInstanceOf(AppAlreadyConnectedToApiServerError);
  });

  test("includes the server's message when the flag is refused (403 for non-administrators)", async () => {
    const message = "Only platform administrators may mark a connection first-party";
    const { adapter } = recordingAdapter(jsonResponse(403, { success: false, message }));
    await expect(
      connectAppToApiServer({
        adapter,
        auth_server_uri: AUTH_SERVER,
        api_server_id: API_SERVER_ID,
        client_app_id: CLIENT_APP_ID,
        first_party: true,
      }),
    ).rejects.toThrow(`Failed to connect app to API server: 403 (${message})`);
  });

  test("falls back to the status code when the error body has no message", async () => {
    const { adapter } = recordingAdapter(new Response("Bad gateway", { status: 502 }));
    await expect(
      connectAppToApiServer({
        adapter,
        auth_server_uri: AUTH_SERVER,
        api_server_id: API_SERVER_ID,
        client_app_id: CLIENT_APP_ID,
      }),
    ).rejects.toThrow(/^Failed to connect app to API server: 502$/);
  });
});
