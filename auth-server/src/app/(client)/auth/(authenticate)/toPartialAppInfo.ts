import type { SchemaVaultsApp } from "@schemavaults/app-definitions";
import type { PartialAppInfo } from "./LoginOrRegisterForm";

export default function toPartialAppInfo(app: SchemaVaultsApp): PartialAppInfo {
  return { app_id: app.app_id, app_name: app.app_name, app_description: app.app_description }
}
