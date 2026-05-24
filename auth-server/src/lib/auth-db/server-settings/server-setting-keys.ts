import { z } from "zod";
import type { ServerSettingValueType } from "./server-settings-table";

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
): z.ZodType<ServerSettingValueTypes[K]> {
  return SERVER_SETTING_DEFINITIONS[key].schema as z.ZodType<
    ServerSettingValueTypes[K]
  >;
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
