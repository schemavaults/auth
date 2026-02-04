import type { SchemaVaultsApiServerDefinition } from "./api-server-definition";
import { SCHEMAVAULTS_AUTH_APP_DEFINITION } from "./hardcoded-core-schemavaults-apps";
import { z } from "zod";

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

export type HardcodedApiServerId =
  (typeof HARDCODED_CORE_SCHEMAVAULTS_API_SERVERS)[number]["api_server_id"];

export const HARDCODED_CORE_SCHEMAVAULTS_API_SERVERS_MAP = new Map(
  HARDCODED_CORE_SCHEMAVAULTS_API_SERVERS.map(
    (api_server) => [api_server.api_server_id, api_server] as const,
  ),
);

const hardcoded_api_server_ids = HARDCODED_CORE_SCHEMAVAULTS_API_SERVERS.map(
  (hardcoded_api_server_id) => hardcoded_api_server_id.api_server_id,
) satisfies readonly HardcodedApiServerId[];

export const hardcodedApiServerIdSchema = z
  .string()
  .refine((api_server_id: string): api_server_id is HardcodedApiServerId => {
    return (
      hardcoded_api_server_ids satisfies readonly string[] as readonly string[]
    ).includes(api_server_id);
  }, "Invalid hardcoded API server ID");

export function isHardcodedApiServerId(
  api_server_id: string,
): api_server_id is HardcodedApiServerId {
  return hardcodedApiServerIdSchema.safeParse(api_server_id).success;
}

export function getHardcodedApiServer(
  api_server_id: string,
): SchemaVaultsApiServerDefinition {
  if (isHardcodedApiServerId(api_server_id)) {
    const api_server_definition =
      HARDCODED_CORE_SCHEMAVAULTS_API_SERVERS_MAP.get(
        api_server_id satisfies HardcodedApiServerId,
      );
    if (api_server_definition) return api_server_definition;
    throw new Error(
      `Failed to retrieve hardcoded API server with ID '${api_server_id}'`,
    );
  } else {
    throw new Error(
      `API server with ID '${api_server_id}' is not a hardcoded API server!`,
    );
  }
}

export default HARDCODED_CORE_SCHEMAVAULTS_API_SERVERS;
