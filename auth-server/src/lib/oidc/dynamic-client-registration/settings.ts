import "server-only";
import type { Kysely } from "@schemavaults/dbh";
import type Redis from "ioredis";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import { ServerSettingsRegistry } from "@/lib/auth-db/server-settings/server-settings-registry";
import type { ParseDynamicClientRegistrationRequestOptions } from "@schemavaults/auth-common";

/**
 * @description Whether anonymous RFC 7591 dynamic client registration is
 * enabled on this deployment (`allow_dynamic_client_registration` server
 * setting; default off).
 */
export async function isDynamicClientRegistrationEnabled(
  db: Kysely<AuthDatabase>,
  redis?: Redis,
): Promise<boolean> {
  const enabled = await new ServerSettingsRegistry(db, undefined, redis).getSetting(
    "allow_dynamic_client_registration",
  );
  return enabled === true;
}

export interface DynamicClientRegistrationSettings
  extends ParseDynamicClientRegistrationRequestOptions {
  enabled: boolean;
}

/**
 * @description Loads every server setting the registration endpoint
 * consults: whether it is enabled at all, and the redirect URI policy
 * (`http://localhost` / private-use schemes) the metadata parser applies.
 */
export async function loadDynamicClientRegistrationSettings(
  db: Kysely<AuthDatabase>,
  redis?: Redis,
): Promise<DynamicClientRegistrationSettings> {
  const registry = new ServerSettingsRegistry(db, undefined, redis);
  const [enabled, allow_localhost_redirect_uris, allow_custom_scheme_redirect_uris] =
    await Promise.all([
      registry.getSetting("allow_dynamic_client_registration"),
      registry.getSetting(
        "dynamic_client_registration_allow_localhost_redirect_uris",
      ),
      registry.getSetting(
        "dynamic_client_registration_allow_custom_scheme_redirect_uris",
      ),
    ]);
  return {
    enabled: enabled === true,
    allow_localhost_redirect_uris: allow_localhost_redirect_uris === true,
    allow_custom_scheme_redirect_uris: allow_custom_scheme_redirect_uris === true,
  };
}
