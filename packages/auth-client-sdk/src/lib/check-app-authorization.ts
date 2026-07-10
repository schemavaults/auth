import type { ISchemaVaultsAuthClientAdapter } from "@/types/ISchemaVaultsAuthClientAdapter";
import { appIdSchema, type AppId } from "@schemavaults/app-definitions";

export interface ICheckAppAuthorizationOpts {
  app_id: AppId;
  auth_server_url: string;
  adapter: ISchemaVaultsAuthClientAdapter;
}

export async function checkAppAuthorization({
  adapter,
  app_id,
  auth_server_url,
}: ICheckAppAuthorizationOpts): Promise<boolean> {
  if (typeof app_id !== "string") {
    throw new TypeError("Expected 'app_id' to be a string!", {
      cause: `Received '${typeof app_id}'`,
    });
  }

  if (!(await appIdSchema.safeParseAsync(app_id)).success) {
    throw new TypeError("Invalid client 'app_id' to check authorization for!");
  }

  const response = await adapter.fetch(
    new URL(
      `/api/apps/${app_id}/check-authorization`,
      auth_server_url,
    ).toString(),
    {
      method: "GET",
      credentials: "include",
    },
  );
  if (!response.ok || response.status < 200 || response.status >= 300) {
    throw new Error("Received failure response from server");
  }
  const data: unknown = await response.json();
  if (!data || typeof data !== "object" || !("authorized" in data)) {
    throw new Error(
      "Unexpected response shape from check-authorization endpoint",
    );
  }
  return (data as { authorized: boolean }).authorized === true;
}

export default checkAppAuthorization;
