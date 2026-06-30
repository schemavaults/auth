import type { SchemaVaultsApp } from "./client-app-definition";
import { defaultHardcodedAppCreationTime } from "./default-hardcoded-app-creation-time";
import SCHEMAVAULTS_AUTH_APP_ID from "./SCHEMAVAULTS_AUTH_APP_ID";

export const SCHEMAVAULTS_AUTH_APP_DEFINITION = {
  app_id: SCHEMAVAULTS_AUTH_APP_ID,
  app_name: "SchemaVaults Auth",
  app_description:
    "SchemaVaults Auth Platform for authenticating and authorizing users",
  hardcoded: true,
  created_at: defaultHardcodedAppCreationTime,
  owner_organization_id: "schemavaults",
  public: true,
  web: true,
} as const satisfies SchemaVaultsApp;

export default SCHEMAVAULTS_AUTH_APP_DEFINITION;
