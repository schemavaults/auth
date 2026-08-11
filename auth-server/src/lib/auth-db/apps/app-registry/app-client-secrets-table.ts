import type { Insertable, Selectable, Updateable } from "@schemavaults/dbh";

/**
 * At most one client secret per app. A row's presence makes the app a
 * confidential OAuth2/OIDC client: the token endpoints then require the
 * client to authenticate with the secret. Only the SHA-256 digest of the
 * secret is stored (hex-encoded); the plaintext is shown once at
 * generation/rotation time and never persisted.
 */
export interface AppClientSecretsTable {
  app_id: string;
  secret_hash: string;
  created_at: number;
  updated_at: number;
  created_by: string | null;
}

export type AppClientSecret = Selectable<AppClientSecretsTable>;
export type NewAppClientSecret = Insertable<AppClientSecretsTable>;
export type AppClientSecretUpdate = Updateable<AppClientSecretsTable>;
