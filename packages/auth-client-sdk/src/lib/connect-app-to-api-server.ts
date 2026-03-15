import type { ISchemaVaultsAuthClientAdapter } from "@/types/ISchemaVaultsAuthClientAdapter";
import type { ApiServerId, AppId } from "@schemavaults/app-definitions";

export interface IConnectAppToApiServerOpts {
  adapter: ISchemaVaultsAuthClientAdapter;
  auth_server_uri: string;
  api_server_id: ApiServerId;
  client_app_id: AppId;
}

export async function connectAppToApiServer({
  adapter,
  auth_server_uri,
  api_server_id,
  client_app_id,
}: IConnectAppToApiServerOpts): Promise<void> {
  const response = await adapter.fetch(
    `${auth_server_uri}/api/apis/${api_server_id}/connect_app/${client_app_id}`,
    {
      method: "POST",
      credentials: "include",
    },
  );

  if (!response.ok) {
    throw new Error(
      `Failed to connect app to API server: ${response.status}`,
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
