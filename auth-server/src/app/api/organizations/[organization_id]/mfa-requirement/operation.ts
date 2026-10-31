import { getHardcodedOrgs, type OrganizationID } from "@schemavaults/auth-common";
import type { Kysely } from "@schemavaults/dbh";
import { z, requireAuth } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { sessionSchemes } from "@/lib/api/auth-schemes";
import { organizationIdParams } from "@/lib/api/domain-schemas/organizations";
import {
  OrganizationMfaGracePeriodDays,
  OrganizationMfaRequirement,
} from "@/lib/api/domain-schemas/organization-mfa-requirements";
import { ErrorResponse, sessionErrorResponses, validationErrorResponse } from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import { OrganizationsRegistry } from "@/lib/auth-db/organizations";
import {
  deleteOrganizationMfaRequirement,
  getOrganizationMfaRequirement,
  startMissingOrganizationMfaGracePeriods,
  upsertOrganizationMfaRequirement,
  userHasVerifiedMfaFactor,
} from "@/lib/auth-db/organization-mfa-requirements";
import captureServerException from "@/lib/captureServerException";
import { notifyOrganizationMfaGracePeriods } from "@/lib/organization-mfa-requirements/organization-mfa-requirement-actions";
import loadOrganizationMfaRequirementView from "@/lib/organization-mfa-requirements/load-organization-mfa-requirement";
import { DEFAULT_ORGANIZATION_MFA_GRACE_PERIOD_DAYS } from "@/lib/organization-mfa-requirements/policy";
import { isOrganizationOwnerOrPlatformAdmin } from "../invitations/shared";

const ROUTE = "/api/organizations/{organization_id}/mfa-requirement";

const OrganizationMfaRequirementEnvelope = z.object({
  success: z.literal(true),
  message: z.string(),
  data: z.object({ requirement: OrganizationMfaRequirement }),
});

function isSystemOrganization(organization_id: OrganizationID): boolean {
  return getHardcodedOrgs().some((org) => org.organization_id === organization_id);
}

async function organizationExists(db: Kysely<AuthDatabase>, organization_id: OrganizationID): Promise<boolean> {
  const row = await db
    .selectFrom("organizations")
    .where("organization_id", "=", organization_id)
    .select("organization_id")
    .executeTakeFirst();
  return row !== undefined;
}

export const getOrganizationMfaRequirementOperation = defineOperation({
  method: "get",
  path: ROUTE,
  summary: "Get an organization's MFA requirement",
  description:
    "Whether the organization requires its members to use multi-factor authentication, and with which grace period. Organization owners and platform administrators also get the members who have no MFA, with their grace period. Members of the organization and platform administrators may call it.",
  tags: [API_TAGS.organizations],
  auth: requireAuth({
    schemes: sessionSchemes,
    notes:
      "The caller must be a member of the organization or a platform administrator; `members_without_mfa` is only listed for owners and platform administrators.",
  }),
  request: { params: organizationIdParams },
  responses: {
    200: { description: "The organization's MFA requirement", schema: OrganizationMfaRequirementEnvelope },
    ...validationErrorResponse,
    ...sessionErrorResponses,
    404: { description: "No such organization", schema: ErrorResponse },
    500: { description: "Failed to load the MFA requirement", schema: ErrorResponse },
  },
  handler: async (ctx) => {
    const user = ctx.auth.user;
    const { db } = ctx.context;
    const { organization_id } = ctx.params;

    try {
      if (!user.admin) {
        const memberships = await new OrganizationsRegistry(db).listUserOrganizationMemberships(user.uid, false);
        if (!memberships.some((m) => m.organization_id === organization_id)) {
          return ctx.json(403, {
            success: false,
            message: "You do not have permission to view this organization's MFA requirement!",
          });
        }
      }
      if (!isSystemOrganization(organization_id) && !(await organizationExists(db, organization_id))) {
        return ctx.json(404, { success: false, message: "Organization not found" });
      }
      const requirement = await loadOrganizationMfaRequirementView(db, {
        organization_id,
        caller_uid: user.uid,
        include_members: await isOrganizationOwnerOrPlatformAdmin(db, user, organization_id),
      });
      return ctx.json(200, {
        success: true,
        message: requirement.required
          ? "The organization requires multi-factor authentication"
          : "The organization does not require multi-factor authentication",
        data: { requirement },
      });
    } catch (e: unknown) {
      await captureServerException(db, e, {
        op_name: "GET_organization_mfa_requirement_handler",
        route: ROUTE,
        uid: user.uid,
        context: { organization_id },
      });
      return ctx.json(500, { success: false, message: "Failed to load the organization's MFA requirement" });
    }
  },
});

const UpdateOrganizationMfaRequirementRequest = z
  .object({
    required: z.boolean().openapi({
      description: "Whether members must use multi-factor authentication",
      example: true,
    }),
    grace_period_days: OrganizationMfaGracePeriodDays.optional().openapi({
      description: `Days members without MFA get to enable it. Defaults to the current grace period, or ${DEFAULT_ORGANIZATION_MFA_GRACE_PERIOD_DAYS} days when MFA was not required yet. Ignored when \`required\` is false.`,
    }),
  })
  .openapi("UpdateOrganizationMfaRequirementRequest");

class CallerWithoutMfaError extends Error {}

export const updateOrganizationMfaRequirementOperation = defineOperation({
  method: "put",
  path: ROUTE,
  summary: "Require (or stop requiring) MFA of an organization's members",
  description:
    "Turns the organization's multi-factor authentication requirement on or off, or changes its grace period. " +
    "While MFA is required, users without a verified MFA factor cannot join the organization (accepting an invitation or being added by a platform administrator is refused). " +
    "Turning it on starts a grace period of `grace_period_days` days for every current member without MFA and emails them; a member who later loses their last factor gets one too. " +
    "A member whose grace period ends without MFA no longer counts as a member, and the enforcement job (`/api/admin/organizations/enforce-mfa-requirements`) removes them from the organization. " +
    "Changing the grace period applies to grace periods started afterwards; turning the requirement off ends every grace period. " +
    "Only organization owners and platform administrators may call it, and a caller who is a member of the organization must have MFA to turn it on. System organizations cannot require MFA.",
  tags: [API_TAGS.organizations],
  auth: requireAuth({
    schemes: sessionSchemes,
    notes: "Only organization owners or platform administrators may change the MFA requirement.",
  }),
  request: {
    params: organizationIdParams,
    body: { lenientContentType: true, schema: UpdateOrganizationMfaRequirementRequest },
  },
  responses: {
    200: { description: "The organization's MFA requirement after the change", schema: OrganizationMfaRequirementEnvelope },
    ...validationErrorResponse,
    401: sessionErrorResponses[401],
    403: {
      description:
        "The account is disabled, the caller is neither an owner of the organization nor a platform administrator, or the organization is a system organization",
      schema: ErrorResponse,
    },
    404: { description: "No such organization", schema: ErrorResponse },
    409: {
      description: "The caller is a member of the organization without MFA and tried to require it (`error: mfa_required`)",
      schema: ErrorResponse,
    },
    500: { description: "Failed to change the MFA requirement", schema: ErrorResponse },
  },
  handler: async (ctx) => {
    const user = ctx.auth.user;
    const { db, redis, environment } = ctx.context;
    const { organization_id } = ctx.params;
    const { required, grace_period_days } = ctx.body;

    if (isSystemOrganization(organization_id)) {
      return ctx.json(403, { success: false, message: "System organizations cannot require multi-factor authentication!" });
    }

    let newly_required = false;
    try {
      if (!(await organizationExists(db, organization_id))) {
        return ctx.json(404, { success: false, message: "Organization not found" });
      }
      if (!(await isOrganizationOwnerOrPlatformAdmin(db, user, organization_id))) {
        return ctx.json(403, {
          success: false,
          message: "Only organization owners or platform administrators can change the MFA requirement",
        });
      }

      if (required) {
        const existing = await getOrganizationMfaRequirement(db, organization_id);
        if (!existing) {
          // Requiring MFA without having it would start the caller's own
          // grace period: they must enable it first.
          const callerMemberships = await new OrganizationsRegistry(db).listUserOrganizationMemberships(user.uid, false);
          if (
            callerMemberships.some((m) => m.organization_id === organization_id) &&
            !(await userHasVerifiedMfaFactor(db, user.uid))
          ) {
            throw new CallerWithoutMfaError();
          }
        }
        const now: number = Date.now();
        newly_required = await db.transaction().execute(async (trx): Promise<boolean> => {
          const result = await upsertOrganizationMfaRequirement(trx, {
            organization_id,
            grace_period_days: grace_period_days ?? existing?.grace_period_days ?? DEFAULT_ORGANIZATION_MFA_GRACE_PERIOD_DAYS,
            actor_uid: user.uid,
            now,
          });
          if (result.newly_required) {
            await startMissingOrganizationMfaGracePeriods(trx, { now, organization_id, reason: "requirement_enabled" });
          }
          return result.newly_required;
        });
        if (newly_required) {
          await notifyOrganizationMfaGracePeriods({ db, redis, now, organization_id, environment });
        }
      } else {
        await deleteOrganizationMfaRequirement(db, organization_id);
      }

      const requirement = await loadOrganizationMfaRequirementView(db, {
        organization_id,
        caller_uid: user.uid,
        include_members: true,
      });
      return ctx.json(200, {
        success: true,
        message: !required
          ? "The organization no longer requires multi-factor authentication"
          : newly_required
            ? "The organization now requires multi-factor authentication"
            : "Updated the organization's multi-factor authentication requirement",
        data: { requirement },
      });
    } catch (e: unknown) {
      if (e instanceof CallerWithoutMfaError) {
        return ctx.json(409, {
          success: false,
          error: "mfa_required",
          message:
            "Enable multi-factor authentication on your own account before requiring it of this organization's members.",
        });
      }
      await captureServerException(db, e, {
        op_name: "PUT_organization_mfa_requirement_handler",
        route: ROUTE,
        uid: user.uid,
        context: { organization_id, required, grace_period_days },
      });
      return ctx.json(500, { success: false, message: "Failed to change the organization's MFA requirement" });
    }
  },
});
