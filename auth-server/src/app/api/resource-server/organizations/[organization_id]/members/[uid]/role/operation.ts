import { apiServerIdSchema } from "@schemavaults/app-definitions";
import {
  organizationIdSchema,
  organizationMembershipRoleTypeSchema,
  type UserData,
} from "@schemavaults/auth-common";
import { z, publicAccess, withOpenApi } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { ResourceServerErrorResponse } from "@/lib/api/domain-schemas/resource-servers";
import { validationErrorResponse } from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import verifyJwksAccessAssertion from "@/app/api/jwks/[audience]/verifyJwksAccessAssertion";
import SchemaVaultsApiServerRegistry from "@/lib/auth-db/apis";
import getUserByUID from "@/lib/auth-db/users/get-user-by-uid";
import captureServerException from "@/lib/captureServerException";
import isUserInOrganization from "@/lib/isUserInOrganization";

const ROUTE = "/api/resource-server/organizations/{organization_id}/members/{uid}/role";

export const OrganizationMemberRoleResponse = z
  .object({
    success: z.literal(true),
    data: z.object({
      organization_id: organizationIdSchema,
      uid: z.guid(),
      role: organizationMembershipRoleTypeSchema
        .nullable()
        .openapi({ description: "The user's role in the organization, or null when not a member (or no such user)", example: "member" }),
    }),
  })
  .openapi("OrganizationMemberRoleResponse");

/**
 * Authenticated with a JWKS access assertion like the other resource-server
 * endpoints, but verified INSIDE the handler rather than through
 * `requireAuth`: the contract (relied on by the E2E suite) validates the
 * path parameters and the `X-Api-Server-Id` header before the credential,
 * answering 400 for a malformed request whatever `Authorization` carries,
 * and the operations runtime authenticates before it validates.
 */
export const getOrganizationMemberRoleForResourceServer = defineOperation({
  method: "get",
  path: ROUTE,
  summary: "Look up a user's organization role",
  description:
    "Tells a resource server which role (`owner`, `member`, ...) a user holds in an organization, or null when they are not a member or do not exist. Only the API server that the organization owns may ask about it: the calling API server names itself in the `X-Api-Server-Id` header and proves it with a single-use JWKS access assertion signed with its JWKS access private key. Resource servers built on `@schemavaults/auth-server-sdk` call this through `isUserInOrganization()`.",
  tags: [API_TAGS.resourceServers],
  auth: publicAccess(
    "Requires `Authorization: Bearer <JWKS access assertion>` (the `schemavaults-jwks-access-assertion` scheme) signed by the API server named in `X-Api-Server-Id`; the handler verifies it after the path and header validation, so a malformed request is refused with 400 before the credential is examined, a missing or invalid assertion with 401. The API server must belong to `organization_id` (403 otherwise).",
  ),
  request: {
    params: z.object({
      organization_id: withOpenApi(organizationIdSchema, {
        description: "Organization the API server belongs to",
        example: "acme",
      }),
      uid: z.guid().openapi({ description: "User id to look up" }),
    }),
    headers: z.object({
      "x-api-server-id": withOpenApi(apiServerIdSchema, {
        description: "Id of the calling API server; the assertion must be signed with its JWKS access key",
        example: "my-resource-api",
      }),
    }),
  },
  responses: {
    200: { description: "The user's role (null when not a member)", schema: OrganizationMemberRoleResponse },
    ...validationErrorResponse,
    401: {
      description: "No `Authorization: Bearer <assertion>` header, or the assertion did not verify for the API server named in `X-Api-Server-Id`",
      schema: ResourceServerErrorResponse,
    },
    403: {
      description: "The API server does not belong to the organization",
      schema: ResourceServerErrorResponse,
    },
    500: { description: "Failed to look up the API server or the membership", schema: ResourceServerErrorResponse },
  },
  handler: async (ctx) => {
    const { organization_id, uid } = ctx.params;
    const api_server_id = ctx.headers["x-api-server-id"];

    // Extract assertion from Authorization header
    const authorization = ctx.request.headers.get("Authorization");
    if (!authorization) {
      return ctx.json(401, { success: false, error: "Unauthorized" });
    }

    const [type, assertion] = authorization.split(" ");
    if (type !== "Bearer" || !assertion) {
      return ctx.json(401, { success: false, error: "Unauthorized" });
    }

    // Opened lazily, only once a credential was presented (as before).
    const { db } = ctx.context;

    // Verify the signed assertion using the resource server's public key
    const isAuthenticated: boolean = await verifyJwksAccessAssertion(assertion, api_server_id, db);
    if (!isAuthenticated) {
      console.warn(
        `[resource-server/organizations] Unauthorized request from api_server_id="${api_server_id}" ` +
          `to check membership for uid="${uid}" in org="${organization_id}"`,
      );
      return ctx.json(401, { success: false, error: "Unauthorized" });
    }

    // Verify the API server owns the requested organization
    try {
      const apiServerRegistry = new SchemaVaultsApiServerRegistry(db);
      const apiServer = await apiServerRegistry.getApiServer(api_server_id);
      if (!apiServer || apiServer.owner_organization_id !== organization_id) {
        return ctx.json(403, {
          success: false,
          error: "Forbidden - API server does not own this organization",
        });
      }
    } catch (e: unknown) {
      await captureServerException(db, e, {
        op_name: "resource-server-organization-role.verifyApiServerOwnership",
        route: "/api/resource-server/organizations/[organization_id]/members/[uid]/role",
        context: { api_server_id, organization_id },
      });
      return ctx.json(500, { success: false, error: "Internal server error" });
    }

    try {
      const userDoc = await getUserByUID(db, uid);
      if (!userDoc) {
        return ctx.json(200, { success: true, data: { organization_id, uid, role: null } });
      }

      const userData: UserData = { ...userDoc, sub: userDoc.uid };
      const role = await isUserInOrganization(db, userData, organization_id);

      return ctx.json(200, {
        success: true,
        data: { organization_id, uid, role: role || null },
      });
    } catch (e: unknown) {
      await captureServerException(db, e, {
        op_name: "resource-server-organization-role.checkMembership",
        route: "/api/resource-server/organizations/[organization_id]/members/[uid]/role",
        uid,
        context: { api_server_id, organization_id },
      });
      return ctx.json(500, { success: false, error: "Internal server error" });
    }
  },
});
