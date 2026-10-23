import type { ISchemaVaultsAuthClientAdapter } from "@/types/ISchemaVaultsAuthClientAdapter";
import { appIdSchema, type AppId } from "@schemavaults/app-definitions";
import {
  listConnectedAppsResponseSchema,
  type ConnectedApp,
} from "@schemavaults/auth-common";
import { z } from "zod";

/**
 * The signed-in user's third-party access ("connected apps"): the client
 * applications they authorized and the API scopes they granted each.
 * These endpoints take the auth server session, so they are only usable
 * from the auth server's own frontend.
 */

interface IConnectedAppsRequestOpts {
  adapter: ISchemaVaultsAuthClientAdapter;
  auth_server_uri: string;
  // Whether this client is running on the auth-server frontend itself.
  is_auth_server: boolean;
}

function assertAuthServer(is_auth_server: boolean, method_name: string): void {
  if (!is_auth_server) {
    throw new Error(
      `${method_name}() is only available on the auth server's own frontend`,
    );
  }
}

async function readFailureMessage(response: Response, action: string): Promise<never> {
  const body: unknown = await response.json().catch(() => null);
  const message =
    typeof body === "object" &&
    body !== null &&
    typeof (body as { message?: unknown }).message === "string"
      ? (body as { message: string }).message
      : `${response.status}`;
  throw new Error(`Failed to ${action}: ${message}`);
}

/** `GET /api/me/connected-apps`: the apps the user authorized, newest first. */
export async function listMyConnectedApps({
  adapter,
  auth_server_uri,
  is_auth_server,
}: IConnectedAppsRequestOpts): Promise<ConnectedApp[]> {
  assertAuthServer(is_auth_server, "listMyConnectedApps");
  const response = await adapter.fetch(`${auth_server_uri}/api/me/connected-apps`, {
    method: "GET",
    credentials: "include",
  });
  if (!response.ok) {
    return await readFailureMessage(response, "list your connected apps");
  }
  const parsed = listConnectedAppsResponseSchema.safeParse(
    await response.json().catch(() => null),
  );
  if (!parsed.success) {
    throw new Error("Connected apps response was malformed", { cause: parsed.error });
  }
  return parsed.data.list;
}

const scopeRevocationResponseSchema = z
  .object({
    success: z.literal(true),
    was_granted: z.boolean(),
    revoked_token_count: z.number().int().nonnegative(),
  })
  .loose();

export interface RevokeMyAppScopeConsentResult {
  /** Whether the user had granted the scope (false: nothing to withdraw). */
  was_granted: boolean;
  /** How many of the app's access tokens for the scope's API server were revoked. */
  revoked_token_count: number;
}

/**
 * `DELETE /api/me/connected-apps/[app_id]/scopes/[api_server_scope_id]`:
 * withdraws one API scope from an app the user authorized (the app stays
 * authorized).
 */
export async function revokeMyAppScopeConsent({
  adapter,
  auth_server_uri,
  is_auth_server,
  app_id,
  api_server_scope_id,
}: IConnectedAppsRequestOpts & {
  app_id: AppId;
  api_server_scope_id: string;
}): Promise<RevokeMyAppScopeConsentResult> {
  assertAuthServer(is_auth_server, "revokeMyAppScopeConsent");
  await appIdSchema.parseAsync(app_id);
  await z.guid().parseAsync(api_server_scope_id);
  const response = await adapter.fetch(
    `${auth_server_uri}/api/me/connected-apps/${encodeURIComponent(app_id)}/scopes/${encodeURIComponent(api_server_scope_id)}`,
    { method: "DELETE", credentials: "include" },
  );
  if (!response.ok) {
    return await readFailureMessage(response, "withdraw the scope");
  }
  const parsed = scopeRevocationResponseSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) {
    throw new Error("Scope withdrawal response was malformed", { cause: parsed.error });
  }
  return {
    was_granted: parsed.data.was_granted,
    revoked_token_count: parsed.data.revoked_token_count,
  };
}

const appAuthorizationRevocationResponseSchema = z
  .object({
    success: z.literal(true),
    was_authorized: z.boolean(),
    revoked_token_count: z.number().int().nonnegative(),
  })
  .loose();

export interface RevokeClientApplicationAuthorizationResult {
  /** Whether the user had authorized the app (false: nothing to revoke). */
  was_authorized: boolean;
  /** How many of the app's tokens issued for the user were revoked. */
  revoked_token_count: number;
}

/**
 * `DELETE /api/apps/[app_id]/authorize`: removes the user's authorization of
 * an app (and every API scope granted to it) and revokes its tokens.
 */
export async function revokeClientApplicationAuthorization({
  adapter,
  auth_server_uri,
  is_auth_server,
  app_id,
}: IConnectedAppsRequestOpts & {
  app_id: AppId;
}): Promise<RevokeClientApplicationAuthorizationResult> {
  assertAuthServer(is_auth_server, "revokeClientApplicationAuthorization");
  await appIdSchema.parseAsync(app_id);
  const response = await adapter.fetch(
    `${auth_server_uri}/api/apps/${encodeURIComponent(app_id)}/authorize`,
    { method: "DELETE", credentials: "include" },
  );
  if (!response.ok) {
    return await readFailureMessage(response, "remove the app's access");
  }
  const parsed = appAuthorizationRevocationResponseSchema.safeParse(
    await response.json().catch(() => null),
  );
  if (!parsed.success) {
    throw new Error("App authorization revocation response was malformed", {
      cause: parsed.error,
    });
  }
  return {
    was_authorized: parsed.data.was_authorized,
    revoked_token_count: parsed.data.revoked_token_count,
  };
}
