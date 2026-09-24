import type { AnyOperationDefinition } from "@schemavaults/openapi-operations";
import { getAudienceJwks } from "@/app/api/jwks/[audience]/operation";
import { getResourceServerAllowedOrigins } from "@/app/api/resource-server/apis/[api_server_id]/allowed-origins/operation";
import { getOrganizationMemberRoleForResourceServer } from "@/app/api/resource-server/organizations/[organization_id]/members/[uid]/role/operation";

/** Operations of the "resource-servers" domain, in the order they appear in the docs. */
export const resource_serversOperations: readonly AnyOperationDefinition[] = [
  getAudienceJwks,
  getResourceServerAllowedOrigins,
  getOrganizationMemberRoleForResourceServer,
];
