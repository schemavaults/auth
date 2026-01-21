import type { SchemaVaultsApp } from "./client-app-definition";
import { defaultHardcodedAppCreationTime } from "./default-hardcoded-app-creation-time";

export const SCHEMAVAULTS_WEB = {
  app_id: "schemavaults-web" as const,
  app_description: "Access SchemaVaults from the web" as const,
  public: true as const,
  app_name: "SchemaVaults Web" as const,
  created_at: defaultHardcodedAppCreationTime,
  web: true as const,
  hardcoded: true as const,
  owner_organization_id: "schemavaults",
} as const satisfies SchemaVaultsApp;

export const SCHEMAVAULTS_CLI = {
  app_id: "schemavaults-cli" as const,
  app_description:
    "Access SchemaVaults from your command-line terminal" as const,
  public: true as const,
  app_name: "SchemaVaults CLI" as const,
  created_at: defaultHardcodedAppCreationTime,
  hardcoded: true as const,
  web: false as const,
  owner_organization_id: "schemavaults",
} as const satisfies SchemaVaultsApp;

export const SCHEMAVAULTS_AUTH_APP_DEFINITION = {
  app_id: "schemavaults-auth" as const,
  app_description: "SchemaVaults Authentication Platform" as const,
  public: true,
  app_name: "SchemaVaults Auth" as const,
  created_at: defaultHardcodedAppCreationTime,
  web: true as const,
  hardcoded: true as const,
  owner_organization_id: "schemavaults",
} as const satisfies SchemaVaultsApp;

export const SCHEMAVAULTS_MAIL_APP_DEFINITION = {
  app_id: "schemavaults-mail" as const,
  app_description: "SchemaVaults Mail Platform" as const,
  public: false,
  app_name: "SchemaVaults Mail" as const,
  created_at: defaultHardcodedAppCreationTime,
  web: true as const,
  hardcoded: true as const,
  owner_organization_id: "schemavaults",
} as const satisfies SchemaVaultsApp;

export const HARDCODED_CORE_SCHEMAVAULTS_APPS = [
  SCHEMAVAULTS_WEB,
  SCHEMAVAULTS_CLI,
  SCHEMAVAULTS_AUTH_APP_DEFINITION,
  SCHEMAVAULTS_MAIL_APP_DEFINITION,
] as const satisfies readonly SchemaVaultsApp[];

export type HardcodedAppId =
  (typeof HARDCODED_CORE_SCHEMAVAULTS_APPS)[number]["app_id"];

export default HARDCODED_CORE_SCHEMAVAULTS_APPS;

export const HARDCODED_CORE_SCHEMAVAULTS_APPS_MAP = new Map(
  HARDCODED_CORE_SCHEMAVAULTS_APPS.map((app) => [app.app_id, app] as const),
);

export function isHardcodedAppId(app_id: string): app_id is HardcodedAppId {
  return HARDCODED_CORE_SCHEMAVAULTS_APPS_MAP.has(
    app_id satisfies string as HardcodedAppId,
  );
}

export function getHardcodedApp(app_id: string): SchemaVaultsApp {
  if (isHardcodedAppId(app_id)) {
    const app = HARDCODED_CORE_SCHEMAVAULTS_APPS_MAP.get(
      app_id satisfies HardcodedAppId,
    );
    if (app) return app;
    throw new Error(`Failed to retrieve hardcoded app with ID '${app_id}'`);
  } else {
    throw new Error(`App ID '${app_id}' is not a hardcoded app!`);
  }
}
