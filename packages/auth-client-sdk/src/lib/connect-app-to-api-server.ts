import type { ISchemaVaultsAuthClientAdapter } from "@/types/ISchemaVaultsAuthClientAdapter";
import type { ApiServerId, AppId } from "@schemavaults/app-definitions";
import { AppAlreadyConnectedToApiServerError } from "@schemavaults/auth-common";

/** Options of {@link connectAppToApiServer} beyond the two ids. */
export interface ConnectAppToApiServerOptions {
  /**
   * Also mark the new connection first-party (users signing in to the app
   * for the API server consent implicitly), in the same transaction.
   * Platform administrators only (403 otherwise); refused (400) for
   * hardcoded API servers. Default false.
   */
  first_party?: boolean;
}

export interface IConnectAppToApiServerOpts extends ConnectAppToApiServerOptions {
  adapter: ISchemaVaultsAuthClientAdapter;
  auth_server_uri: string;
  api_server_id: ApiServerId;
  client_app_id: AppId;
}

/** The server's `message` of a failed response, when it sent one. */
async function readFailureMessage(response: Response): Promise<string | null> {
  try {
    const body: unknown = await response.json();
    if (typeof body === "object" && body !== null) {
      const message: unknown = (body as { message?: unknown }).message;
      if (typeof message === "string" && message.length > 0) return message;
    }
  } catch {
    // Not JSON: fall back to the status code alone.
  }
  return null;
}

export async function connectAppToApiServer({
  adapter,
  auth_server_uri,
  api_server_id,
  client_app_id,
  first_party,
}: IConnectAppToApiServerOpts): Promise<void> {
  const response = await adapter.fetch(
    `${auth_server_uri}/api/apis/${api_server_id}/connect_app/${client_app_id}`,
    {
      method: "POST",
      credentials: "include",
      // The body is optional; without the flag the request stays exactly
      // what older auth servers expect.
      ...(first_party === true
        ? {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ first_party: true }),
          }
        : {}),
    },
  );

  if (!response.ok) {
    if (response.status === 409) {
      throw new AppAlreadyConnectedToApiServerError();
    }
    const message: string | null = await readFailureMessage(response);
    throw new Error(
      `Failed to connect app to API server: ${response.status}${message ? ` (${message})` : ""}`,
    );
  }

  const body: unknown = await response.json();
  if (
    typeof body !== "object" ||
    !body ||
    !(body as { success: boolean }).success
  ) {
    throw new Error("Connect app to API server response indicated failure");
  }
}

export default connectAppToApiServer;
