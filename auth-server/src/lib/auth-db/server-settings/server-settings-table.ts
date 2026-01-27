import type { Insertable, Selectable, Updateable } from "@schemavaults/dbh";

/**
 * Value types supported by server settings
 */
export type ServerSettingValueType = "string" | "number" | "boolean" | "json";

/**
 * Database table schema for server_settings
 */
export interface ServerSettingsTable {
  setting_key: string;
  setting_value: string;
  value_type: ServerSettingValueType;
  description: string | null;
  created_at: number | string;
  updated_at: number | string;
  updated_by: string | null;
}

export type ServerSettingRow = Selectable<ServerSettingsTable>;
export type NewServerSettingRow = Insertable<ServerSettingsTable>;
export type ServerSettingRowUpdate = Updateable<ServerSettingsTable>;
