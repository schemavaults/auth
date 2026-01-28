// Types-only file - safe to import from client components
// This file must NOT have any runtime dependencies on server-only code

export type { ServerSettingValueType } from "./server-settings-table";
export type {
  ServerSettingsTable,
  ServerSettingRow,
  NewServerSettingRow,
  ServerSettingRowUpdate,
} from "./server-settings-table";

export type {
  ServerSettingKey,
  ServerSettingValueTypes,
} from "./server-setting-keys";

/**
 * Record representing a server setting as stored in the database
 */
export interface ServerSettingRecord {
  key: string;
  value: unknown;
  valueType: string;
  description: string | null;
  updatedAt: number;
  updatedBy: string | null;
}
