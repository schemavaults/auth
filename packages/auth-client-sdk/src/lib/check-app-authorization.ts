import type { ISchemaVaultsAuthClientAdapter } from "@/types/ISchemaVaultsAuthClientAdapter";
import { appIdSchema, type AppId } from "@schemavaults/app-definitions";
import { appConsentStatusSchema, type AppConsentStatus } from "@schemavaults/auth-common";

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

export interface IGetAppConsentStatusOpts extends ICheckAppAuthorizationOpts {
  /** The authorization request's requested `scope`. */
  scope?: string | null;
  /** The authorization request's RFC 8707 `resource`. */
  resource?: string | null;
}

/**
 * `GET /api/apps/[app_id]/check-authorization?scope=…&resource=…`: whether
 * the signed-in user authorized the app, and what the consent screen has to
 * ask for before an authorization code for this request is handed to it.
 */
export async function getAppConsentStatus({
  adapter,
  app_id,
  auth_server_url,
  scope,
  resource,
}: IGetAppConsentStatusOpts): Promise<AppConsentStatus> {
  if (!(await appIdSchema.safeParseAsync(app_id)).success) {
    throw new TypeError("Invalid client 'app_id' to check consent for!");
  }
  const url = new URL(`/api/apps/${app_id}/check-authorization`, auth_server_url);
  if (typeof scope === "string" && scope.length > 0) {
    url.searchParams.set("scope", scope);
  }
  if (typeof resource === "string" && resource.length > 0) {
    url.searchParams.set("resource", resource);
  }
  const response = await adapter.fetch(url.toString(), {
    method: "GET",
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error(`Failed to check app consent status (HTTP ${response.status})`);
  }
  const parsed = appConsentStatusSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) {
    throw new Error("Unexpected response shape from check-authorization endpoint", {
      cause: parsed.error,
    });
  }
  return parsed.data;
}
