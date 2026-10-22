import type { ISchemaVaultsAuthClientAdapter } from "@/types/ISchemaVaultsAuthClientAdapter";
import { apiServerIdSchema, type ApiServerId } from "@schemavaults/app-definitions";
import {
  apiServerScopeSchema,
  createApiServerScopeRequestSchema,
  updateApiServerScopeRequestSchema,
  type ApiServerScope,
  type CreateApiServerScopeRequest,
  type UpdateApiServerScopeRequest,
} from "@schemavaults/auth-common";
import { z } from "zod";

/**
 * API scopes: the OAuth 2.0 scope values an API server defines for itself
 * (`/api/apis/[api_server_id]/scopes`). Clients request them with the API
 * server as the RFC 8707 `resource` of their authorization request (e.g.
 * `login({ scope: "openid notes:read", resource: "my-notes-api" })`).
 */

interface IApiServerScopesRequestOpts {
  adapter: ISchemaVaultsAuthClientAdapter;
  auth_server_uri: string;
  api_server_id: ApiServerId;
}

function scopesUrl(auth_server_uri: string, api_server_id: ApiServerId, api_server_scope_id?: string): string {
  const base = `${auth_server_uri}/api/apis/${encodeURIComponent(api_server_id)}/scopes`;
  return api_server_scope_id
    ? `${base}/${encodeURIComponent(api_server_scope_id)}`
    : base;
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

const scopeResponseSchema = z
  .object({ success: z.literal(true), scope: apiServerScopeSchema })
  .loose();

/** `GET /api/apis/[api_server_id]/scopes`: the scopes the API server defines. */
export async function listApiServerScopes({
  adapter,
  auth_server_uri,
  api_server_id,
}: IApiServerScopesRequestOpts): Promise<ApiServerScope[]> {
  await apiServerIdSchema.parseAsync(api_server_id);
  const response = await adapter.fetch(scopesUrl(auth_server_uri, api_server_id), {
    method: "GET",
    credentials: "include",
  });
  if (!response.ok) {
    return await readFailureMessage(response, "list API server scopes");
  }
  const parsed = z
    .object({ success: z.literal(true), list: z.array(apiServerScopeSchema) })
    .loose()
    .safeParse(await response.json().catch(() => null));
  if (!parsed.success) {
    throw new Error("API server scopes response was malformed", { cause: parsed.error });
  }
  return parsed.data.list;
}

/**
 * `POST /api/apis/[api_server_id]/scopes`: defines a new scope. Requires
 * management access to the API server.
 */
export async function createApiServerScope({
  adapter,
  auth_server_uri,
  api_server_id,
  scope,
}: IApiServerScopesRequestOpts & { scope: CreateApiServerScopeRequest }): Promise<ApiServerScope> {
  await apiServerIdSchema.parseAsync(api_server_id);
  const body = await createApiServerScopeRequestSchema.parseAsync(scope);
  const response = await adapter.fetch(scopesUrl(auth_server_uri, api_server_id), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    credentials: "include",
  });
  if (!response.ok) {
    return await readFailureMessage(response, "define API scope");
  }
  const parsed = scopeResponseSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) {
    throw new Error("API scope creation response was malformed", { cause: parsed.error });
  }
  return parsed.data.scope;
}

/**
 * `PATCH /api/apis/[api_server_id]/scopes/[api_server_scope_id]`: changes a
 * scope's description (the value is immutable). Requires management access.
 */
export async function updateApiServerScope({
  adapter,
  auth_server_uri,
  api_server_id,
  api_server_scope_id,
  update,
}: IApiServerScopesRequestOpts & {
  api_server_scope_id: string;
  update: UpdateApiServerScopeRequest;
}): Promise<ApiServerScope> {
  await apiServerIdSchema.parseAsync(api_server_id);
  const body = await updateApiServerScopeRequestSchema.parseAsync(update);
  const response = await adapter.fetch(
    scopesUrl(auth_server_uri, api_server_id, api_server_scope_id),
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      credentials: "include",
    },
  );
  if (!response.ok) {
    return await readFailureMessage(response, "update API scope");
  }
  const parsed = scopeResponseSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) {
    throw new Error("API scope update response was malformed", { cause: parsed.error });
  }
  return parsed.data.scope;
}

/**
 * `DELETE /api/apis/[api_server_id]/scopes/[api_server_scope_id]`. Requires
 * management access to the API server.
 */
export async function deleteApiServerScope({
  adapter,
  auth_server_uri,
  api_server_id,
  api_server_scope_id,
}: IApiServerScopesRequestOpts & { api_server_scope_id: string }): Promise<void> {
  await apiServerIdSchema.parseAsync(api_server_id);
  const response = await adapter.fetch(
    scopesUrl(auth_server_uri, api_server_id, api_server_scope_id),
    { method: "DELETE", credentials: "include" },
  );
  if (!response.ok) {
    await readFailureMessage(response, "delete API scope");
  }
}
