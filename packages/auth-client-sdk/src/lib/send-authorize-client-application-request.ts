import type { ISchemaVaultsAuthClientAdapter } from "@/types/ISchemaVaultsAuthClientAdapter";
import { appIdSchema, type AppId } from "@schemavaults/app-definitions";

export interface ISendAuthorizeClientApplicationRequestOpts {
  app_id: AppId;
  adapter: ISchemaVaultsAuthClientAdapter;
  // Optional OAuth2 `state` CSRF nonce declared by the client to the
  // server for the in-flight authorize request. Not persisted — the
  // value round-trips through the browser's authorize URL → callback URL.
  state?: string | null;
  // Optional per-scope consent: the authorization request's `scope` and
  // RFC 8707 `resource`, and the API scopes the user approved on the
  // consent screen (recorded as their consent).
  consent?: AuthorizeClientApplicationConsent;
}

export interface AuthorizeClientApplicationConsent {
  scope?: string | null;
  resource?: string | null;
  approved_api_scopes?: readonly string[];
}

export async function sendAuthorizeClientApplicationRequest({
  adapter,
  app_id,
  state,
  consent,
}: ISendAuthorizeClientApplicationRequestOpts): Promise<void> {
  if (typeof app_id !== "string") {
    throw new TypeError("Expected app to authorize's id to be a string");
  } else if (!(await appIdSchema.safeParseAsync(app_id)).success) {
    throw new TypeError(
      "Invalid client 'app_id' to send authorization request for!",
    );
  }

  const body: Record<string, unknown> = {
    ...(typeof state === "string" && state.length > 0 ? { state } : {}),
    ...(typeof consent?.scope === "string" && consent.scope.length > 0
      ? { scope: consent.scope }
      : {}),
    ...(typeof consent?.resource === "string" && consent.resource.length > 0
      ? { resource: consent.resource }
      : {}),
    ...(consent?.approved_api_scopes && consent.approved_api_scopes.length > 0
      ? { approved_api_scopes: [...consent.approved_api_scopes] }
      : {}),
  };
  // eslint-disable-next-line no-undef
  const init: RequestInit = {
    method: "POST",
    credentials: "include",
    ...(Object.keys(body).length > 0
      ? {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
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
