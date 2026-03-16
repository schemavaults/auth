import type { ISchemaVaultsAuthClientAdapter } from "@/types/ISchemaVaultsAuthClientAdapter";
import type { AppId } from "@schemavaults/app-definitions";

export interface IDeleteClientApplicationOpts {
  adapter: ISchemaVaultsAuthClientAdapter;
  auth_server_uri: string;
  app_id: AppId;
}

export async function deleteClientApplication({
  adapter,
  auth_server_uri,
  app_id,
}: IDeleteClientApplicationOpts): Promise<void> {
  const response = await adapter.fetch(
    `${auth_server_uri}/api/apps/${app_id}`,
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
        : `Failed to delete client application: ${response.status}`;
    throw new Error(message);
  }

  const body: unknown = await response.json();
  if (
    typeof body !== "object" ||
    !body ||
    !(body as { success: boolean }).success
  ) {
    throw new Error("Delete client application response indicated failure");
  }
}

export default deleteClientApplication;
