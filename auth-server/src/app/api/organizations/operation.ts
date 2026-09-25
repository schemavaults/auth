import {
  getHardcodedOrgs,
  organizationDefinitionSchema,
  type OrganizationDefinition,
} from "@schemavaults/auth-common";
import { z, requireAuth, withOpenApi } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { sessionSchemes } from "@/lib/api/auth-schemes";
import {
  adminErrorResponses,
  ErrorResponse,
  ResourceCreationResponse,
  sessionErrorResponses,
} from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import { OrganizationsRegistry } from "@/lib/auth-db";
import {
  MAXIMUM_USER_ORGANIZATIONS,
  createOrganization,
  addOrganizationMembership,
  hasUserExceededMaximumOrgMemberships,
} from "@/lib/auth-db/organizations";
import captureServerException from "@/lib/captureServerException";
import adminOnlyOrganizationCreation from "@/lib/config/admin-only-organization-creation";
import { ConflictError } from "@/lib/error/ConflictError";

const ROUTE = "/api/organizations";

class ExceededMembershipLimitError extends Error {}

export const createOrganizationOperation = defineOperation({
  method: "post",
  path: ROUTE,
  summary: "Create an organization",
  description:
    "Creates an organization and makes the caller its owner. When the `admin_only_organization_creation` server setting is on, only platform administrators may create organizations. Reserved (hardcoded) organization ids are refused.",
  tags: [API_TAGS.organizations],
  auth: requireAuth({ schemes: sessionSchemes }),
  request: {
    body: {
      lenientContentType: true,
      schema: withOpenApi(organizationDefinitionSchema, "OrganizationDefinition"),
      description: "`created_by` is ignored and set to the caller.",
    },
  },
  responses: {
    200: { description: "The organization was created", schema: ResourceCreationResponse },
    400: { description: "The body failed validation or names a reserved id", schema: ErrorResponse },
    ...sessionErrorResponses,
    409: {
      description: "The organization id is taken, or the caller reached the membership limit",
      schema: ErrorResponse,
    },
    500: { description: "Failed to create the organization", schema: ErrorResponse },
  },
  handler: async (ctx) => {
    const user = ctx.auth.user;
    const { db, redis, environment } = ctx.context;
    if (environment === "development") console.log("POST => /api/organizations");

    // Enforce admin-only organization creation when the server setting is enabled
    let adminOnly: boolean;
    try {
      adminOnly = await adminOnlyOrganizationCreation(db, redis.client);
    } catch (e: unknown) {
      await captureServerException(db, e, {
        op_name: "POST_create_organization_handler.adminOnlyOrganizationCreation",
        route: ROUTE,
        uid: user.uid,
      });
      return ctx.json(500, { success: false, message: "Failed to check organization creation permissions" });
    }
    if (adminOnly && !user.admin) {
      return ctx.json(403, { success: false, message: "Only admins may create new organizations on this server" });
    }

    const newOrganization: OrganizationDefinition = { ...ctx.body, created_by: user.uid };

    // Ensure new organization definition is not a reserved organization ID
    if (getHardcodedOrgs().some((org) => org.organization_id === newOrganization.organization_id)) {
      return ctx.json(400, { success: false, message: "Attempting to create an organization with a reserved ID" });
    }

    const organization_id = newOrganization.organization_id;
    const uid: string = user.uid;
    try {
      await db.transaction().execute(async (trx) => {
        if (await hasUserExceededMaximumOrgMemberships(trx, uid)) {
          throw new ExceededMembershipLimitError();
        }
        await createOrganization(trx, newOrganization);
        // Add the creating user as owner of the organization
        await addOrganizationMembership(trx, organization_id, uid, "owner");
      });
    } catch (e: unknown) {
      if (e instanceof ConflictError) {
        return ctx.json(409, { success: false, message: e.message });
      }
      if (e instanceof ExceededMembershipLimitError) {
        return ctx.json(409, {
          success: false,
          message: `You have reached the maximum number of organization memberships (${MAXIMUM_USER_ORGANIZATIONS}). Please leave an organization before creating a new one.`,
        });
      }
      await captureServerException(db, e, {
        op_name: "POST_create_organization_handler.createOrganizationTx",
        route: ROUTE,
        uid,
        context: { organization_id },
      });
      return ctx.json(500, { success: false, message: "Failed to create new organization" });
    }

    return ctx.json(200, {
      success: true,
      message: "Successfully created new organization",
      resource_id: organization_id,
    });
  },
});

export const listAllOrganizations = defineOperation({
  method: "get",
  path: ROUTE,
  summary: "List every organization",
  description: "Platform administrators only. Users list their own memberships with `GET /api/me/organizations`.",
  tags: [API_TAGS.organizations],
  auth: requireAuth({ schemes: sessionSchemes, routeGuard: "admin" }),
  responses: {
    200: {
      description: "All organizations",
      schema: z.object({
        success: z.literal(true),
        message: z.string(),
        data: z.object({ organizations: z.array(organizationDefinitionSchema).readonly() }),
      }),
    },
    ...adminErrorResponses,
    500: { description: "Failed to list organizations", schema: ErrorResponse },
  },
  handler: async (ctx) => {
    const user = ctx.auth.user;
    const { db } = ctx.context;
    let organizations: readonly OrganizationDefinition[];
    try {
      organizations = await new OrganizationsRegistry(db).listAllOrganizations();
    } catch (e: unknown) {
      await captureServerException(db, e, {
        op_name: "GET_list_organizations_handler.listAllOrganizations",
        route: ROUTE,
        uid: user.uid,
      });
      return ctx.json(500, { success: false, message: "Failed to list all organizations!" });
    }
    return ctx.json(200, {
      success: true,
      message: "Successfully listed all organizations!",
      data: { organizations },
    });
  },
});
