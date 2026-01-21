import type { SchemaVaultsApiServerDefinition } from "./api-server-definition";
import { SCHEMAVAULTS_AUTH_APP_DEFINITION } from "./hardcoded-core-schemavaults-apps";

const createdAt: number = new Date(
  new Date(new Date().setFullYear(2024)).setMonth(7),
).setDate(27);

export const SCHEMAVAULTS_AUTH_SERVER = {
  api_server_id: SCHEMAVAULTS_AUTH_APP_DEFINITION.app_id,
  api_server_name: "SchemaVaults Auth",
  api_server_description: SCHEMAVAULTS_AUTH_APP_DEFINITION.app_description,
  public: true,
  created_at: createdAt,
  hardcoded: true,
  owner_organization_id: "schemavaults",
} as const satisfies SchemaVaultsApiServerDefinition;

export const SCHEMAVAULTS_REGISTRY_SERVER = {
  api_server_id: "schemavaults-registry",
  api_server_name: "SchemaVaults Registry",
  api_server_description: "Store schemas and other SchemaVaults data",
  public: true,
  created_at: createdAt,
  hardcoded: true,
  owner_organization_id: "schemavaults",
} as const satisfies SchemaVaultsApiServerDefinition;

export const SCHEMAVAULTS_MAIL_SERVER = {
  api_server_id: "schemavaults-mail",
  api_server_name: "SchemaVaults Mail",
  api_server_description:
    "Send e-mails to SchemaVaults users & mailing list(s).",
  public: true,
  created_at: createdAt,
  hardcoded: true,
  owner_organization_id: "schemavaults",
} as const satisfies SchemaVaultsApiServerDefinition;

export const HARDCODED_CORE_SCHEMAVAULTS_API_SERVERS = [
  SCHEMAVAULTS_REGISTRY_SERVER,
  SCHEMAVAULTS_MAIL_SERVER,
  SCHEMAVAULTS_AUTH_SERVER,
] as const satisfies readonly SchemaVaultsApiServerDefinition[];

export default HARDCODED_CORE_SCHEMAVAULTS_API_SERVERS;
