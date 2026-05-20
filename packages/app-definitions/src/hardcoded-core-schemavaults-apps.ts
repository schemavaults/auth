import { z } from "zod";
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

export const SCHEMAVAULTS_REGISTRY_FRONTEND = {
  app_id: "schemavaults-registry" as const,
  app_description: "Frontend for the SchemaVaults Registry server" as const,
  public: true as const,
  app_name: "SchemaVaults Registry" as const,
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
  SCHEMAVAULTS_REGISTRY_FRONTEND,
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

const hardcoded_app_ids = HARDCODED_CORE_SCHEMAVAULTS_APPS.map(
  (hardcoded_app) => hardcoded_app.app_id,
) satisfies readonly HardcodedAppId[];

export const hardcodedAppIdSchema = z
  .string()
  .refine((app_id: string): app_id is HardcodedAppId => {
    return (
      hardcoded_app_ids satisfies readonly string[] as readonly string[]
    ).includes(app_id);
  }, "Invalid hardcoded app ID");

export function isHardcodedAppId(app_id: string): app_id is HardcodedAppId {
  if (typeof app_id !== "string") return false;
  return hardcodedAppIdSchema.safeParse(app_id).success;
}

export function getHardcodedApp(app_id: string): SchemaVaultsApp {
  if (typeof app_id !== "string" || app_id.length === 0) {
    throw new TypeError(
      "Expected 'app_id' to look up hardcoded app with to be a non-empty string!",
    );
  }
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
