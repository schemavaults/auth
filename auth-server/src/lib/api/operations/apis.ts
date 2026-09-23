import type { AnyOperationDefinition } from "@schemavaults/openapi-operations";
import { createApiServer, listApiServers } from "@/app/api/apis/operation";
import {
  deleteApiServer,
  getApiServer,
  updateApiServerDynamicClientPolicy,
} from "@/app/api/apis/[api_server_id]/operation";
import {
  addApiServerDomain,
  listApiServerDomains,
} from "@/app/api/apis/[api_server_id]/domains/operation";
import {
  connectAppToApiServer,
  disconnectAppFromApiServer,
  getAppToApiServerConnection,
} from "@/app/api/apis/[api_server_id]/connect_app/[client_app_id]/operation";
import {
  generateJwksAccessKey,
  getJwksAccessKeyMetadata,
  regenerateJwksAccessKey,
} from "@/app/api/apis/[api_server_id]/jwks-access-key/operation";

/** Operations of the "apis" domain, in the order they appear in the docs. */
export const apisOperations: readonly AnyOperationDefinition[] = [
  listApiServers,
  createApiServer,
  getApiServer,
  updateApiServerDynamicClientPolicy,
  deleteApiServer,
  listApiServerDomains,
  addApiServerDomain,
  getAppToApiServerConnection,
  connectAppToApiServer,
  disconnectAppFromApiServer,
  getJwksAccessKeyMetadata,
  generateJwksAccessKey,
  regenerateJwksAccessKey,
];
