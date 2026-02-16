import type { ISchemaVaultsAuthClientAdapter } from "@/types/ISchemaVaultsAuthClientAdapter";
import {
  appIdSchema,
  isHardcodedAppId,
  type AppId,
} from "@schemavaults/app-definitions";

export interface ICheckAppAuthorizationOpts {
  app_id: AppId;
  adapter: ISchemaVaultsAuthClientAdapter;
}

export async function checkAppAuthorization({
  adapter,
  app_id,
}: ICheckAppAuthorizationOpts): Promise<boolean> {
  if (typeof app_id !== "string") {
    throw new TypeError("Expected app_id to be a string");
  } else if (!(await appIdSchema.safeParseAsync(app_id)).success) {
    throw new TypeError("Invalid client 'app_id' to check authorization for!");
  }

  // all hardcoded schemavaults apps are authorized
  if (isHardcodedAppId(app_id)) {
    return true;
  }

  const response = await adapter.fetch(
    `/api/apps/${app_id}/check-authorization`,
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
