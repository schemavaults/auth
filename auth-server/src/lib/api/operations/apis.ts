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
import { deleteApiServerDomain } from "@/app/api/apis/[api_server_id]/domains/[api_server_domain_ref_id]/operation";
import {
  connectAppToApiServer,
  disconnectAppFromApiServer,
  getAppToApiServerConnection,
} from "@/app/api/apis/[api_server_id]/connect_app/[client_app_id]/operation";
import {
  getAppApiScopePolicyOperation,
  updateAppApiScopePolicyOperation,
} from "@/app/api/apis/[api_server_id]/connect_app/[client_app_id]/scopes/operation";
import {
  getAppApiConnectionFirstPartyOperation,
  setAppApiConnectionFirstPartyOperation,
} from "@/app/api/apis/[api_server_id]/connect_app/[client_app_id]/first-party/operation";
import {
  generateJwksAccessKey,
  getJwksAccessKeyMetadata,
  regenerateJwksAccessKey,
} from "@/app/api/apis/[api_server_id]/jwks-access-key/operation";
import { setApiServerOrganizationMembershipVisibility } from "@/app/api/apis/[api_server_id]/organization-membership-visibility/operation";
import { setApiServerDelegatedTokenPolicy } from "@/app/api/apis/[api_server_id]/delegated-token-policy/operation";
import {
  createApiServerScope,
  listApiServerScopes,
} from "@/app/api/apis/[api_server_id]/scopes/operation";
import {
  deleteApiServerScope,
  updateApiServerScope,
} from "@/app/api/apis/[api_server_id]/scopes/[api_server_scope_id]/operation";

/** Operations of the "apis" domain, in the order they appear in the docs. */
export const apisOperations: readonly AnyOperationDefinition[] = [
  listApiServers,
  createApiServer,
  getApiServer,
  updateApiServerDynamicClientPolicy,
  setApiServerOrganizationMembershipVisibility,
  setApiServerDelegatedTokenPolicy,
  deleteApiServer,
  listApiServerDomains,
  addApiServerDomain,
  deleteApiServerDomain,
  listApiServerScopes,
  createApiServerScope,
  updateApiServerScope,
  deleteApiServerScope,
  getAppToApiServerConnection,
  connectAppToApiServer,
  disconnectAppFromApiServer,
  getAppApiScopePolicyOperation,
  updateAppApiScopePolicyOperation,
  getAppApiConnectionFirstPartyOperation,
  setAppApiConnectionFirstPartyOperation,
  getJwksAccessKeyMetadata,
  generateJwksAccessKey,
  regenerateJwksAccessKey,
];
