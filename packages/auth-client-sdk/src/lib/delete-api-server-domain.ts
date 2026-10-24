import type { ISchemaVaultsAuthClientAdapter } from "@/types/ISchemaVaultsAuthClientAdapter";
import { apiServerIdSchema, type ApiServerId } from "@schemavaults/app-definitions";

export interface IDeleteApiServerDomainOpts {
  adapter: ISchemaVaultsAuthClientAdapter;
  auth_server_uri: string;
  api_server_id: ApiServerId;
  api_server_domain_ref_id: string;
}

export async function deleteApiServerDomain({
  adapter,
  auth_server_uri,
  api_server_id,
  api_server_domain_ref_id,
}: IDeleteApiServerDomainOpts): Promise<void> {
  if (!(await apiServerIdSchema.safeParseAsync(api_server_id)).success) {
    throw new TypeError("Invalid api_server_id");
  }
  if (
    typeof api_server_domain_ref_id !== "string" ||
    api_server_domain_ref_id.length === 0
  ) {
    throw new TypeError("Invalid api_server_domain_ref_id");
  }

  const response = await adapter.fetch(
    `${auth_server_uri}/api/apis/${api_server_id}/domains/${api_server_domain_ref_id}`,
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
        : `Failed to delete API server domain: ${response.status}`;
    throw new Error(message);
  }

  const body: unknown = await response.json();
  if (
    typeof body !== "object" ||
    !body ||
    !(body as { success: boolean }).success
  ) {
    throw new Error("API server domain deletion response indicated failure");
  }
}

export default deleteApiServerDomain;
