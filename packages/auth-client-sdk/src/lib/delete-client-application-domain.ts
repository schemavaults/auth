import type { ISchemaVaultsAuthClientAdapter } from "@/types/ISchemaVaultsAuthClientAdapter";
import { appIdSchema, type AppId } from "@schemavaults/app-definitions";

export interface IDeleteClientApplicationDomainOpts {
  adapter: ISchemaVaultsAuthClientAdapter;
  auth_server_uri: string;
  app_id: AppId;
  app_domain_ref_id: string;
}

export async function deleteClientApplicationDomain({
  adapter,
  auth_server_uri,
  app_id,
  app_domain_ref_id,
}: IDeleteClientApplicationDomainOpts): Promise<void> {
  if (!(await appIdSchema.safeParseAsync(app_id)).success) {
    throw new TypeError("Invalid app_id");
  }
  if (typeof app_domain_ref_id !== "string" || app_domain_ref_id.length === 0) {
    throw new TypeError("Invalid app_domain_ref_id");
  }

  const response = await adapter.fetch(
    `${auth_server_uri}/api/apps/${app_id}/domains/${app_domain_ref_id}`,
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
        : `Failed to delete client application domain: ${response.status}`;
    throw new Error(message);
  }

  const body: unknown = await response.json();
  if (
    typeof body !== "object" ||
    !body ||
    !(body as { success: boolean }).success
  ) {
    throw new Error("Client application domain deletion response indicated failure");
  }
}

export default deleteClientApplicationDomain;
