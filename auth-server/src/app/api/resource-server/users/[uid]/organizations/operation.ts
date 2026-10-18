import {
  apiServerIdSchema,
  getOrganizationMembershipAccess,
  getOrganizationMembershipVisibility,
  organizationMembershipVisibilitySchema,
  type SchemaVaultsApiServerDefinition,
} from "@schemavaults/app-definitions";
import {
  organizationMembershipRoleDetailsSchema,
  type OrganizationMembershipRoleDetails,
  type UserData,
} from "@schemavaults/auth-common";
import { z, requireAuth, withOpenApi } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { jwksAccessAssertionScheme } from "@/lib/api/auth-schemes";
import {
  jwksAssertionErrorResponses,
  ResourceServerBadRequestResponse,
  ResourceServerErrorResponse,
} from "@/lib/api/domain-schemas/resource-servers";
import { API_TAGS } from "@/lib/api/tags";
import SchemaVaultsApiServerRegistry from "@/lib/auth-db/apis";
import { listUserOrganizationMembershipDetails } from "@/lib/auth-db/organizations";
import getUserByUID from "@/lib/auth-db/users/get-user-by-uid";
import { userDocumentToUserData } from "@/lib/auth-db/users/load-user-by-uid";
import captureServerException from "@/lib/captureServerException";
import {
  MAX_SUBJECT_TOKEN_LENGTH,
  parseSubjectTokenHeader,
  type ParsedSubjectTokenHeader,
} from "@/lib/resource-server/subject-token-header";
import { verifyResourceServerSubjectToken } from "@/lib/resource-server/verify-subject-token";

const ROUTE = "/api/resource-server/users/{uid}/organizations";
const ROUTE_FOLDER = "/api/resource-server/users/[uid]/organizations";

export const ResourceServerUserOrganizationsResponse = z
  .object({
    success: z.literal(true),
    data: z.object({
      uid: z.guid(),
      organization_membership_visibility: withOpenApi(organizationMembershipVisibilitySchema, {
        description:
          "The calling API server's visibility: `owning_organization` lists at most the membership of its own organization, `all_organizations` every membership",
      }),
      memberships: z
        .array(withOpenApi(organizationMembershipRoleDetailsSchema, "OrganizationMembershipRoleDetails"))
        .readonly()
        .openapi({ description: "The user's memberships the API server may see (empty when the user no longer exists)" }),
    }),
  })
  .openapi("ResourceServerUserOrganizationsResponse");

/**
 * Lists a user's organization memberships for a resource server, bound to
 * the user's own access token for that resource server (`X-Subject-Token`)
 * so that an API server can only look up users who are actively using it.
 */
export const listUserOrganizationsForResourceServer = defineOperation({
  method: "get",
  path: ROUTE,
  summary: "List a user's organization memberships",
  description:
    "Tells a resource server which organizations a user belongs to, with their role in each, in the shape of `GET /api/me/organizations`. The calling API server names itself in the `X-Api-Server-Id` header, proves it with a single-use JWKS access assertion, and forwards the user's access token for the API server in `X-Subject-Token`: a resource server can only list the memberships of a user who is currently signed in to it. Only memberships the API server may see are returned: its owning organization's, or every organization's when a platform administrator set its organization membership visibility to `all_organizations` (`PUT /api/apis/{api_server_id}/organization-membership-visibility`). Resource servers built on `@schemavaults/auth-server-sdk` call this through `listUserOrganizations()` (or `ctx.auth.listOrganizationMemberships()` in operation handlers).",
  tags: [API_TAGS.resourceServers],
  auth: requireAuth({
    schemes: [jwksAccessAssertionScheme],
    notes:
      "The assertion must be signed by the API server named in `X-Api-Server-Id`; every assertion is accepted once. `X-Subject-Token` must be an active access token of `uid` for that API server (403 otherwise).",
  }),
  request: {
    params: z.object({
      uid: z.guid().openapi({ description: "User id to list the memberships of; must be the subject of `X-Subject-Token`" }),
    }),
    headers: z.object({
      "x-api-server-id": withOpenApi(apiServerIdSchema, {
        description: "Id of the calling API server; the assertion must be signed with its JWKS access key",
        example: "my-resource-api",
      }),
      // Required here; its contents are parsed by the handler
      // (parseSubjectTokenHeader), which answers in this endpoint's envelope.
      "x-subject-token": z.string().openapi({
        description: `The user's access token for the calling API server, exactly as it was presented to the resource server: a JWE in compact serialization of at most ${MAX_SUBJECT_TOKEN_LENGTH} characters`,
      }),
    }),
  },
  responses: {
    200: { description: "The memberships the API server may see", schema: ResourceServerUserOrganizationsResponse },
    ...jwksAssertionErrorResponses,
    400: {
      description:
        "`X-Api-Server-Id` or `X-Subject-Token` is missing or malformed (`X-Subject-Token` must be a JWE in compact serialization, not too long, whose protected header names the platform's algorithm and carries `enc`, `keyset_id` and `aud`), or the request failed validation",
      schema: ResourceServerBadRequestResponse,
    },
    403: {
      description: "`X-Subject-Token` is not an active access token of `uid` for the calling API server",
      schema: ResourceServerErrorResponse,
    },
    500: { description: "Failed to verify the subject token or list the memberships", schema: ResourceServerErrorResponse },
  },
  handler: async (ctx) => {
    const { db, dbh, environment } = ctx.context;
    const { uid } = ctx.params;
    // The resolver verified the assertion for this very id.
    const api_server_id = ctx.headers["x-api-server-id"];
    const subjectToken: ParsedSubjectTokenHeader = parseSubjectTokenHeader(ctx.headers["x-subject-token"]);
    if (subjectToken.kind !== "token") {
      return ctx.json(400, {
        success: false,
        error: `Bad Request - ${subjectToken.kind === "malformed" ? subjectToken.reason : "X-Subject-Token is required"}`,
      });
    }
    const subject_token: string = subjectToken.token;

    let apiServer: SchemaVaultsApiServerDefinition | null;
    let isSubjectTokenValid: boolean;
    try {
      apiServer = await new SchemaVaultsApiServerRegistry(db).getApiServer(api_server_id);
      isSubjectTokenValid =
        apiServer !== null &&
        (await verifyResourceServerSubjectToken({ dbh, environment, api_server_id, uid, subject_token }));
    } catch (e: unknown) {
      await captureServerException(db, e, {
        op_name: "resource-server-user-organizations.verifySubjectToken",
        route: ROUTE_FOLDER,
        uid,
        context: { api_server_id },
      });
      return ctx.json(500, { success: false, error: "Internal server error" });
    }
    if (!apiServer || !isSubjectTokenValid) {
      return ctx.json(403, {
        success: false,
        error: "Forbidden - X-Subject-Token is not an active access token of this user for this API server",
      });
    }

    try {
      const userDoc = await getUserByUID(db, uid);
      let memberships: readonly OrganizationMembershipRoleDetails[] = [];
      if (userDoc) {
        // Converted rather than spread: the strict UserData schema refuses
        // the database-only `service_account_app_id` of a service account.
        const userData: UserData = await userDocumentToUserData(userDoc);
        const allMemberships = await listUserOrganizationMembershipDetails(db, {
          uid,
          admin: userData.admin ?? false,
          onEnrichmentFailure: (organization_id: string, reason: unknown) =>
            captureServerException(db, reason, {
              op_name: "resource-server-user-organizations.enrichMembership",
              route: ROUTE_FOLDER,
              uid,
              context: { api_server_id, organization_id, nonFatal: true },
            }),
        });
        const visibleApiServer: SchemaVaultsApiServerDefinition = apiServer;
        memberships = allMemberships.filter(
          (membership) => getOrganizationMembershipAccess(visibleApiServer, membership.organization_id) !== false,
        );
      }

      return ctx.json(
        200,
        {
          success: true,
          data: {
            uid,
            organization_membership_visibility: getOrganizationMembershipVisibility(apiServer),
            memberships,
          },
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    } catch (e: unknown) {
      await captureServerException(db, e, {
        op_name: "resource-server-user-organizations.listMemberships",
        route: ROUTE_FOLDER,
        uid,
        context: { api_server_id },
      });
      return ctx.json(500, { success: false, error: "Internal server error" });
    }
  },
});
