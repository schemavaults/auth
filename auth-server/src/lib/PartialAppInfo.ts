// PartialAppInfo.ts
// Just the app information required to show the "Authorize App Consent Screen"

import type { SchemaVaultsApp } from "@schemavaults/app-definitions";

export interface PartialAppInfo {
  app_id: string;
  app_name: string;
  app_description: string;
}

export function toPartialAppInfo(app: SchemaVaultsApp): PartialAppInfo {
  return { app_id: app.app_id, app_name: app.app_name, app_description: app.app_description }
}

export default toPartialAppInfo;
