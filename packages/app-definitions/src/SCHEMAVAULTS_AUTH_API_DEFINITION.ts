import type { SchemaVaultsApiServerDefinition } from "./api-server-definition";
import { defaultHardcodedAppCreationTime } from "./default-hardcoded-app-creation-time";
import SCHEMAVAULTS_AUTH_APP_ID from "./SCHEMAVAULTS_AUTH_APP_ID";

export const SCHEMAVAULTS_AUTH_API_DEFINITION = {
  api_server_id: SCHEMAVAULTS_AUTH_APP_ID,
  api_server_name: "SchemaVaults Auth",
  api_server_description:
    "SchemaVaults Auth Platform for authenticating and authorizing users",
  hardcoded: true,
  created_at: defaultHardcodedAppCreationTime,
  owner_organization_id: "schemavaults",
  public: true,
} as const satisfies SchemaVaultsApiServerDefinition;
export default SCHEMAVAULTS_AUTH_API_DEFINITION;
