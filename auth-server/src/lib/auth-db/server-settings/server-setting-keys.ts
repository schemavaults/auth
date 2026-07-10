import { z } from "zod";
import type { ServerSettingValueType } from "./server-settings-table";
import { apiServerIdSchema } from "@schemavaults/app-definitions";

/**
 * Registry of all known server setting keys with their types and defaults.
 * Add new settings here to maintain type safety across the codebase.
 */
export const SERVER_SETTING_DEFINITIONS = {
  invite_code_required: {
    valueType: "boolean" as const,
    defaultValue: true,
    schema: z.boolean(),
    description: "Whether users must provide an invite code to register",
  },
  private_beta_mode: {
    valueType: "boolean" as const,
    defaultValue: false,
    schema: z.boolean(),
    description: "Whether the server is running in private beta mode",
  },
  admin_only_organization_creation: {
    valueType: "boolean" as const,
    defaultValue: false,
    schema: z.boolean(),
    description:
      "Whether only admins can create new organizations. When false, any non-disabled user can create organizations.",
  },
  mail_server_configured: {
    valueType: "boolean" as const,
    defaultValue: false,
    schema: z.boolean(),
    description: "Whether a @schemavaults/mail-server has been configured for sending mail."
  },
  mail_server_api_id: {
    valueType: "string" as const,
    defaultValue: "schemavaults-mail",
    schema: apiServerIdSchema,
    description: "API server ID of a @schemavaults/mail-server instance for sending mail."
  },
  spoofed_superuser_email: {
    valueType: "string" as const,
    defaultValue: "admin@schemavaults.com",
    schema: z.string().email(),
    description:
      "Email address embedded as the identity claim in internally-minted (spoofed) superuser access tokens, e.g. the token the auth server uses to authorize with the mail-server.",
  }
} as const satisfies Record<
  string,
  {
    valueType: ServerSettingValueType;
    defaultValue: unknown;
    schema: z.ZodType;
    description: string;
  }
>;

/**
 * Union type of all valid server setting keys
 */
export type ServerSettingKey = keyof typeof SERVER_SETTING_DEFINITIONS;

/**
 * Map of setting keys to their value types
 */
export type ServerSettingValueTypes = {
  [K in ServerSettingKey]: z.infer<
    (typeof SERVER_SETTING_DEFINITIONS)[K]["schema"]
  >;
};

/**
 * Type-safe helper to get the default value for a setting
 */
export function getDefaultValue<K extends ServerSettingKey>(
  key: K
): ServerSettingValueTypes[K] {
  return SERVER_SETTING_DEFINITIONS[key]
    .defaultValue as ServerSettingValueTypes[K];
}

/**
 * Type-safe helper to get the schema for a setting
 */
export function getSettingSchema<K extends ServerSettingKey>(
  key: K
) {
  return SERVER_SETTING_DEFINITIONS[key].schema;
}

/**
 * Type-safe helper to get the value type for a setting
 */
export function getSettingValueType<K extends ServerSettingKey>(
  key: K
): ServerSettingValueType {
  return SERVER_SETTING_DEFINITIONS[key].valueType;
}

/**
 * Check if a key is a valid server setting key
 */
export function isValidServerSettingKey(key: string): key is ServerSettingKey {
  return key in SERVER_SETTING_DEFINITIONS;
}

/**
 * Get all known setting keys
 */
export function getAllSettingKeys(): readonly ServerSettingKey[] {
  return Object.keys(SERVER_SETTING_DEFINITIONS) as ServerSettingKey[];
}
