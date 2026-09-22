import "server-only";
import { randomUUID } from "node:crypto";
import {
  appIdSchema,
  dynamicClientRegistrationOwnership,
  getAppEnvironment,
  type AppId,
  type DynamicClientRegistrationMetadataFields,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import type {
  DynamicClientRegistrationResponse,
  ParsedDynamicClientMetadata,
} from "@schemavaults/auth-common";
import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import { SchemaVaultsAppRegistry } from "@/lib/auth-db/apps";
import { generateClientSecret, hashClientSecret } from "@/lib/oauth2/client-secret";

/**
 * Prefix of client ids issued by dynamic client registration. The
 * remainder is a random UUID, so the id satisfies the platform's base id
 * grammar (lowercase alphanumerics, `-`, `_`; 2–64 characters) and can
 * never collide with a hardcoded or console-created app id by accident.
 */
export const DYNAMIC_CLIENT_ID_PREFIX = "dcr-" as const;

export function generateDynamicClientId(): AppId {
  const candidate: string = `${DYNAMIC_CLIENT_ID_PREFIX}${randomUUID()}`;
  const parsed = appIdSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new Error("Generated dynamic client id does not satisfy the app id schema");
  }
  return parsed.data;
}

export function isDynamicClientId(app_id: string): boolean {
  return app_id.startsWith(DYNAMIC_CLIENT_ID_PREFIX);
}

export interface RegisterDynamicClientOptions {
  db: Kysely<AuthDatabase>;
  metadata: ParsedDynamicClientMetadata;
  environment?: SchemaVaultsAppEnvironment;
  /** Injectable for tests. */
  now?: () => number;
}

export interface RegisteredDynamicClient {
  client_id: AppId;
  /** Plaintext secret, returned exactly once; null for public clients. */
  client_secret: string | null;
  /** Seconds since the Unix epoch (RFC 7591 §3.2.1). */
  client_id_issued_at: number;
  metadata: ParsedDynamicClientMetadata;
}

/**
 * @description Persists a dynamically registered client: the APPS row
 * (ownerless, `web: true` so the OIDC authorize endpoint accepts it even
 * for native clients, never publicly listed), one APP_CALLBACK_URLS row
 * per redirect URI for the deployment's own environment, and — for
 * `client_secret_basic` / `client_secret_post` clients — the hashed
 * client secret. Everything is written in one transaction so a partial
 * registration can never be left behind.
 */
export async function registerDynamicClient({
  db,
  metadata,
  environment = getAppEnvironment(),
  now = Date.now,
}: RegisterDynamicClientOptions): Promise<RegisteredDynamicClient> {
  const client_id: AppId = generateDynamicClientId();
  const created_at_ms: number = now();
  const client_id_issued_at: number = Math.floor(created_at_ms / 1000);

  const confidential: boolean = metadata.token_endpoint_auth_method !== "none";
  const client_secret: string | null = confidential ? generateClientSecret() : null;

  const stored_metadata: DynamicClientRegistrationMetadataFields = {
    client_uri: metadata.client_uri,
    logo_uri: metadata.logo_uri,
    tos_uri: metadata.tos_uri,
    policy_uri: metadata.policy_uri,
    contacts: metadata.contacts ? [...metadata.contacts] : null,
    grant_types: [...metadata.grant_types],
    response_types: [...metadata.response_types],
    token_endpoint_auth_method: metadata.token_endpoint_auth_method,
    software_id: metadata.software_id,
    software_version: metadata.software_version,
    registered_scope: metadata.scope,
    client_id_issued_at,
  };

  await db.transaction().execute(async (trx) => {
    const appRegistry = new SchemaVaultsAppRegistry(trx);

    await appRegistry.registerApp({
      app_id: client_id,
      app_name: metadata.client_name,
      app_description: describeDynamicClient(metadata),
      // Never publicly listed: nobody vetted this client.
      publicly_listed: false,
      ownership: dynamicClientRegistrationOwnership(),
      // The OIDC surface only serves browser-redirect delivery and
      // refuses `web: false` apps, so every registered client — native
      // ones included — is stored as `web: true`. Native clients receive
      // their code on a loopback / private-scheme redirect URI like any
      // other RFC 8252 client.
      web: true,
      created_by: null,
      dynamic_client_metadata: stored_metadata,
    });

    for (const callback_url of metadata.redirect_uris) {
      await appRegistry.addAppCallbackUrl(client_id, {
        app_callback_url_ref_id: randomUUID(),
        app_id: client_id,
        callback_url,
        environment,
        created_at: created_at_ms,
      });
    }

    if (client_secret !== null) {
      await appRegistry.setClientSecret(
        client_id,
        hashClientSecret(client_secret),
        null,
      );
    }
  });

  return { client_id, client_secret, client_id_issued_at, metadata };
}

function describeDynamicClient(metadata: ParsedDynamicClientMetadata): string {
  const parts: string[] = [
    "Registered through OAuth 2.0 dynamic client registration (RFC 7591).",
  ];
  if (metadata.client_uri) {
    parts.push(`Client URI: ${metadata.client_uri}`);
  }
  if (metadata.software_id) {
    parts.push(
      `Software: ${metadata.software_id}${metadata.software_version ? ` ${metadata.software_version}` : ""}`,
    );
  }
  // The definition caps descriptions at 512 characters.
  return parts.join(" ").slice(0, 512);
}

/**
 * @description Builds the RFC 7591 §3.2.1 response body: the issued
 * identifiers plus every registered metadata value. Absent optional
 * members are omitted rather than sent as null (the RFC's JSON members
 * are either present or not).
 */
export function buildDynamicClientRegistrationResponse(
  registered: RegisteredDynamicClient,
): DynamicClientRegistrationResponse {
  const { metadata } = registered;
  return {
    client_id: registered.client_id,
    ...(registered.client_secret !== null
      ? {
          client_secret: registered.client_secret,
          // RFC 7591 §3.2.1: 0 means the secret does not expire.
          client_secret_expires_at: 0,
        }
      : {}),
    client_id_issued_at: registered.client_id_issued_at,
    redirect_uris: [...metadata.redirect_uris],
    client_name: metadata.client_name,
    token_endpoint_auth_method: metadata.token_endpoint_auth_method,
    grant_types: [...metadata.grant_types],
    response_types: [...metadata.response_types],
    ...(metadata.client_uri ? { client_uri: metadata.client_uri } : {}),
    ...(metadata.logo_uri ? { logo_uri: metadata.logo_uri } : {}),
    ...(metadata.tos_uri ? { tos_uri: metadata.tos_uri } : {}),
    ...(metadata.policy_uri ? { policy_uri: metadata.policy_uri } : {}),
    ...(metadata.contacts ? { contacts: [...metadata.contacts] } : {}),
    ...(metadata.scope ? { scope: metadata.scope } : {}),
    ...(metadata.software_id ? { software_id: metadata.software_id } : {}),
    ...(metadata.software_version
      ? { software_version: metadata.software_version }
      : {}),
  };
}
