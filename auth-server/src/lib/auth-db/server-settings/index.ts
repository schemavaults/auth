// Server-only exports - these will cause errors if imported in client components
// Import these directly when in server context
export { ServerSettingsRegistry } from "./server-settings-registry";

export {
  getServerSetting,
  envParsers,
} from "./get-server-setting";

// Shared exports - safe to import anywhere (no server-only dependency)
export {
  SERVER_SETTING_DEFINITIONS,
  getDefaultValue,
  getSettingSchema,
  getSettingValueType,
  isValidServerSettingKey,
  getAllSettingKeys,
} from "./server-setting-keys";
export type {
  ServerSettingKey,
  ServerSettingValueTypes,
} from "./server-setting-keys";

export type * from "./server-settings-table";
export type { ServerSettingRecord } from "./types";
