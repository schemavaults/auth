// client-application-service-account.ts
//
// Client SDK operations for a client application's SERVICE ACCOUNT: the
// machine identity that access tokens obtained through the OAuth2
// client_credentials grant (RFC 6749 §4.4) are issued to. The service
// account is created lazily by the first grant; these operations let an
// app's managers inspect it, create it ahead of time (so its uid can be
// granted permissions on resource servers up front) and remove it.

import type { ISchemaVaultsAuthClientAdapter } from "@/types/ISchemaVaultsAuthClientAdapter";
import { appIdSchema, type AppId } from "@schemavaults/app-definitions";

export interface ClientApplicationServiceAccount {
  /** The service account's user id — the `sub`/`uid` of its tokens. */
  uid: string;
  /** Synthetic, undeliverable address under the reserved `.invalid` TLD. */
  email: string;
  /** Creation time (ms since epoch). */
  created_at: number;
  /** A disabled service account is refused the client_credentials grant. */
  disabled: boolean;
}

export interface ClientApplicationServiceAccountStatus {
  /** Null until the first client_credentials grant or explicit creation. */
  service_account: ClientApplicationServiceAccount | null;
  /**
   * Whether the app is a confidential client (has a client secret) and
   * may therefore use the client_credentials grant.
   */
  has_client_secret: boolean;
}

export interface CreatedClientApplicationServiceAccount {
  service_account: ClientApplicationServiceAccount;
  /** False when the service account already existed. */
  created: boolean;
  message: string;
}

interface IClientApplicationServiceAccountOpts {
  adapter: ISchemaVaultsAuthClientAdapter;
  auth_server_uri: string;
  app_id: AppId;
}

function serviceAccountEndpoint(
  auth_server_uri: string,
  app_id: AppId,
): string {
  return new URL(
    `/api/apps/${app_id}/service-account`,
    auth_server_uri,
  ).toString();
}

async function assertValidAppId(app_id: AppId): Promise<void> {
  if (!(await appIdSchema.safeParseAsync(app_id)).success) {
    throw new TypeError("Invalid app_id");
  }
}

async function extractFailureMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  const body = await response.json().catch(() => null);
  return body && typeof body === "object" && "message" in body
    ? (body as { message: string }).message
    : fallback;
}

function parseServiceAccount(raw: unknown): ClientApplicationServiceAccount {
  if (
    typeof raw !== "object" ||
    !raw ||
    typeof (raw as { uid?: unknown }).uid !== "string" ||
    typeof (raw as { email?: unknown }).email !== "string" ||
    typeof (raw as { created_at?: unknown }).created_at !== "number"
  ) {
    throw new Error("Invalid service account in response");
  }
  const sa = raw as {
    uid: string;
    email: string;
    created_at: number;
    disabled?: unknown;
  };
  return {
    uid: sa.uid,
    email: sa.email,
    created_at: sa.created_at,
    disabled: sa.disabled === true,
  };
}

export async function getClientApplicationServiceAccount({
  adapter,
  auth_server_uri,
  app_id,
}: IClientApplicationServiceAccountOpts): Promise<ClientApplicationServiceAccountStatus> {
  await assertValidAppId(app_id);

  const response = await adapter.fetch(
    serviceAccountEndpoint(auth_server_uri, app_id),
    { method: "GET", credentials: "include" },
  );
  if (!response.ok) {
    throw new Error(
      await extractFailureMessage(
        response,
        `Failed to load service account: ${response.status}`,
      ),
    );
  }

  const body: unknown = await response.json();
  if (
    typeof body !== "object" ||
    !body ||
    !(body as { success: boolean }).success ||
    typeof (body as { has_client_secret?: unknown }).has_client_secret !==
      "boolean"
  ) {
    throw new Error("Invalid response from service account endpoint");
  }
  const status = body as {
    service_account: unknown;
    has_client_secret: boolean;
  };
  return {
    service_account:
      status.service_account === null || status.service_account === undefined
        ? null
        : parseServiceAccount(status.service_account),
    has_client_secret: status.has_client_secret,
  };
}

/** Create the service account ahead of its first client_credentials grant (idempotent). */
export async function createClientApplicationServiceAccount({
  adapter,
  auth_server_uri,
  app_id,
}: IClientApplicationServiceAccountOpts): Promise<CreatedClientApplicationServiceAccount> {
  await assertValidAppId(app_id);

  const response = await adapter.fetch(
    serviceAccountEndpoint(auth_server_uri, app_id),
    { method: "POST", credentials: "include" },
  );
  if (!response.ok) {
    throw new Error(
      await extractFailureMessage(
        response,
        `Failed to create service account: ${response.status}`,
      ),
    );
  }

  const body: unknown = await response.json();
  if (
    typeof body !== "object" ||
    !body ||
    !(body as { success: boolean }).success
  ) {
    throw new Error("Invalid response from service account creation endpoint");
  }
  const created = body as {
    service_account: unknown;
    created?: unknown;
    message?: unknown;
  };
  return {
    service_account: parseServiceAccount(created.service_account),
    created: created.created === true,
    message:
      typeof created.message === "string"
        ? created.message
        : "Service account created.",
  };
}

/** Remove the service account; the next grant creates a new one with a different uid. */
export async function deleteClientApplicationServiceAccount({
  adapter,
  auth_server_uri,
  app_id,
}: IClientApplicationServiceAccountOpts): Promise<void> {
  await assertValidAppId(app_id);

  const response = await adapter.fetch(
    serviceAccountEndpoint(auth_server_uri, app_id),
    { method: "DELETE", credentials: "include" },
  );
  if (!response.ok) {
    throw new Error(
      await extractFailureMessage(
        response,
        `Failed to delete service account: ${response.status}`,
      ),
    );
  }

  const body: unknown = await response.json();
  if (
    typeof body !== "object" ||
    !body ||
    !(body as { success: boolean }).success
  ) {
    throw new Error("Service account deletion response indicated failure");
  }
}
