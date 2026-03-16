import type { ISchemaVaultsAuthClientAdapter } from "@/types/ISchemaVaultsAuthClientAdapter";
import type { ApiServerId } from "@schemavaults/app-definitions";

export interface IDeleteApiServerOpts {
  adapter: ISchemaVaultsAuthClientAdapter;
  auth_server_uri: string;
  api_server_id: ApiServerId;
}

export async function deleteApiServer({
  adapter,
  auth_server_uri,
  api_server_id,
}: IDeleteApiServerOpts): Promise<void> {
  const response = await adapter.fetch(
    `${auth_server_uri}/api/apis/${api_server_id}`,
    {
      method: "DELETE",
      credentials: "include",
    },
  );

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message =
      body && typeof body === "object" && "message" in body
        ? (body as { message: string }).message
        : `Failed to delete API server: ${response.status}`;
    throw new Error(message);
  }

  const body: unknown = await response.json();
  if (
    typeof body !== "object" ||
    !body ||
    !(body as { success: boolean }).success
  ) {
    throw new Error("Delete API server response indicated failure");
  }
}

export default deleteApiServer;
