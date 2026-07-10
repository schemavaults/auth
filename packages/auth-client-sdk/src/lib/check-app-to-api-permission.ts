import type { ISchemaVaultsAuthClientAdapter } from "@/types/ISchemaVaultsAuthClientAdapter";
import type { ApiServerId, AppId } from "@schemavaults/app-definitions";

export interface ICheckAppToApiPermissionOpts {
  adapter: ISchemaVaultsAuthClientAdapter;
  auth_server_uri: string;
  api_server_id: ApiServerId;
  client_app_id: AppId;
}

export async function checkAppToApiPermission({
  adapter,
  auth_server_uri,
  api_server_id,
  client_app_id,
}: ICheckAppToApiPermissionOpts): Promise<boolean> {
  const response = await adapter.fetch(
    new URL(
      `/api/apis/${api_server_id}/connect_app/${client_app_id}`,
      auth_server_uri,
    ).toString(),

    {
      method: "GET",
      credentials: "include",
    },
  );

  if (!response.ok) {
    throw new Error(
      `Failed to check app-to-api permission: ${response.status}`,
    );
  }

  const body: unknown = await response.json();
  if (
    typeof body !== "object" ||
    !body ||
    !("success" in body) ||
    !body.success
  ) {
    throw new Error("Check app-to-api permission response indicated failure");
  }

  if (!("is_allowed" in body) || typeof body.is_allowed !== "boolean") {
    throw new TypeError(
      "Expected a boolean 'is_allowed' property on response object!",
    );
  }

  return body.is_allowed;
}

export default checkAppToApiPermission;
