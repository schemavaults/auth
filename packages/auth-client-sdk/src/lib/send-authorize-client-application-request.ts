import type { ISchemaVaultsAuthClientAdapter } from "@/types/ISchemaVaultsAuthClientAdapter";
import { appIdSchema, type AppId } from "@schemavaults/app-definitions";

export interface ISendAuthorizeClientApplicationRequestOpts {
  app_id: AppId;
  adapter: ISchemaVaultsAuthClientAdapter;
  // Optional OAuth2 `state` CSRF nonce declared by the client to the
  // server for the in-flight authorize request. Not persisted — the
  // value round-trips through the browser's authorize URL → callback URL.
  state?: string | null;
}

export async function sendAuthorizeClientApplicationRequest({
  adapter,
  app_id,
  state,
}: ISendAuthorizeClientApplicationRequestOpts): Promise<void> {
  if (typeof app_id !== "string") {
    throw new TypeError("Expected app to authorize's id to be a string");
  } else if (!(await appIdSchema.safeParseAsync(app_id)).success) {
    throw new TypeError(
      "Invalid client 'app_id' to send authorization request for!",
    );
  }

  const hasState: boolean = typeof state === "string" && state.length > 0;
  // eslint-disable-next-line no-undef
  const init: RequestInit = {
    method: "POST",
    credentials: "include",
    ...(hasState
      ? {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ state }),
        }
      : {}),
  };

  const response = await adapter.fetch(`/api/apps/${app_id}/authorize`, init);
  if (!response.ok || response.status < 200 || response.status >= 300) {
    throw new Error("Received failure response from server");
  }
  return;
}

export default sendAuthorizeClientApplicationRequest;
