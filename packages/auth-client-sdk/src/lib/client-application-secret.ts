// client-application-secret.ts
//
// Client SDK operations for managing a client application's OAuth2/OIDC
// client secret: metadata read, generation, rotation, and removal. The
// plaintext secret only ever appears in the generation/rotation
// response — it is never retrievable afterwards.

import type { ISchemaVaultsAuthClientAdapter } from "@/types/ISchemaVaultsAuthClientAdapter";
import { appIdSchema, type AppId } from "@schemavaults/app-definitions";

export interface ClientApplicationSecretMetadata {
  /** Whether the app currently has a client secret (is a confidential client). */
  has_client_secret: boolean;
  /** First-generation time (ms since epoch); absent without a secret. */
  created_at?: number;
  /** Last generation/rotation time (ms since epoch); absent without a secret. */
  updated_at?: number;
}

export interface GeneratedClientApplicationSecret {
  /** The plaintext client secret — shown once, never retrievable again. */
  client_secret: string;
  message: string;
}

interface IClientApplicationSecretOpts {
  adapter: ISchemaVaultsAuthClientAdapter;
  auth_server_uri: string;
  app_id: AppId;
}

function clientSecretEndpoint(auth_server_uri: string, app_id: AppId): string {
  return new URL(
    `/api/apps/${app_id}/client-secret`,
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

export async function getClientApplicationSecretMetadata({
  adapter,
  auth_server_uri,
  app_id,
}: IClientApplicationSecretOpts): Promise<ClientApplicationSecretMetadata> {
  await assertValidAppId(app_id);

  const response = await adapter.fetch(
    clientSecretEndpoint(auth_server_uri, app_id),
    {
      method: "GET",
      credentials: "include",
    },
  );

  if (!response.ok) {
    throw new Error(
      await extractFailureMessage(
        response,
        `Failed to load client secret metadata: ${response.status}`,
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
    throw new Error("Invalid response from client secret metadata endpoint");
  }

  const metadata = body as {
    has_client_secret: boolean;
    created_at?: number;
    updated_at?: number;
  };
  return {
    has_client_secret: metadata.has_client_secret,
    created_at: metadata.created_at,
    updated_at: metadata.updated_at,
  };
}

async function requestClientSecretGeneration(
  { adapter, auth_server_uri, app_id }: IClientApplicationSecretOpts,
  method: "POST" | "PUT",
): Promise<GeneratedClientApplicationSecret> {
  await assertValidAppId(app_id);

  const response = await adapter.fetch(
    clientSecretEndpoint(auth_server_uri, app_id),
    {
      method,
      credentials: "include",
    },
  );

  if (!response.ok) {
    throw new Error(
      await extractFailureMessage(
        response,
        `Failed to generate client secret: ${response.status}`,
      ),
    );
  }

  const body: unknown = await response.json();
  if (
    typeof body !== "object" ||
    !body ||
    !(body as { success: boolean }).success ||
    typeof (body as { client_secret?: unknown }).client_secret !== "string"
  ) {
    throw new Error("Invalid response from client secret generation endpoint");
  }

  const generated = body as { client_secret: string; message?: string };
  return {
    client_secret: generated.client_secret,
    message: generated.message ?? "Client secret generated successfully.",
  };
}

/** Generate a client secret for an app that has none (fails with 409 otherwise). */
export async function generateClientApplicationSecret(
  opts: IClientApplicationSecretOpts,
): Promise<GeneratedClientApplicationSecret> {
  return requestClientSecretGeneration(opts, "POST");
}

/** Rotate (or create) the client secret; the previous secret stops working immediately. */
export async function rotateClientApplicationSecret(
  opts: IClientApplicationSecretOpts,
): Promise<GeneratedClientApplicationSecret> {
  return requestClientSecretGeneration(opts, "PUT");
}

/** Remove the client secret, reverting the app to a public client. */
export async function deleteClientApplicationSecret({
  adapter,
  auth_server_uri,
  app_id,
}: IClientApplicationSecretOpts): Promise<void> {
  await assertValidAppId(app_id);

  const response = await adapter.fetch(
    clientSecretEndpoint(auth_server_uri, app_id),
    {
      method: "DELETE",
      credentials: "include",
    },
  );

  if (!response.ok) {
    throw new Error(
      await extractFailureMessage(
        response,
        `Failed to delete client secret: ${response.status}`,
      ),
    );
  }

  const body: unknown = await response.json();
  if (
    typeof body !== "object" ||
    !body ||
    !(body as { success: boolean }).success
  ) {
    throw new Error("Client secret deletion response indicated failure");
  }
}
