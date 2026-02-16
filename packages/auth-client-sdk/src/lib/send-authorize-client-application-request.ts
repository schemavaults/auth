import type { ISchemaVaultsAuthClientAdapter } from "@/types/ISchemaVaultsAuthClientAdapter";
import { appIdSchema, type AppId } from "@schemavaults/app-definitions";

export interface ISendAuthorizeClientApplicationRequestOpts {
  app_id: AppId;
  adapter: ISchemaVaultsAuthClientAdapter;
}

export async function sendAuthorizeClientApplicationRequest({
  adapter,
  app_id,
}: ISendAuthorizeClientApplicationRequestOpts): Promise<void> {
  if (typeof app_id !== "string") {
    throw new TypeError("Expected app to authorize's id to be a string");
  } else if (!(await appIdSchema.safeParseAsync(app_id)).success) {
    throw new TypeError(
      "Invalid client 'app_id' to send authorization request for!",
    );
  }

  const response = await adapter.fetch(`/api/apps/${app_id}/authorize`, {
    method: "POST",
    credentials: "include",
  });
  if (!response.ok || response.status < 200 || response.status >= 300) {
    throw new Error("Received failure response from server");
  }
  return;
}

export default sendAuthorizeClientApplicationRequest;
