import { organizationIdSchema } from "@schemavaults/auth-common";
import { z } from "@schemavaults/openapi-operations";
import {
  MAX_ORGANIZATION_MFA_GRACE_PERIOD_DAYS,
  MIN_ORGANIZATION_MFA_GRACE_PERIOD_DAYS,
  organizationMfaGracePeriodReasons,
} from "@/lib/organization-mfa-requirements/policy";
import { OrganizationMembershipRole } from "./organizations";

/** Schemas of the organization MFA requirement operations (migration 00048). */

export const OrganizationMfaGracePeriodReason = z.enum(organizationMfaGracePeriodReasons).openapi({
  description:
    "Why the grace period started: `requirement_enabled` (the organization started requiring MFA) or `mfa_removed` (the member lost their last MFA factor while a member).",
  example: "requirement_enabled",
});

export const OrganizationMfaGracePeriodDays = z
  .number()
  .int()
  .min(MIN_ORGANIZATION_MFA_GRACE_PERIOD_DAYS)
  .max(MAX_ORGANIZATION_MFA_GRACE_PERIOD_DAYS)
  .openapi({
    description: `Days members without MFA get to enable it before they are removed (${MIN_ORGANIZATION_MFA_GRACE_PERIOD_DAYS}-${MAX_ORGANIZATION_MFA_GRACE_PERIOD_DAYS}).`,
    example: 14,
  });

/** A member of an organization that requires MFA who has none. */
export const OrganizationMemberWithoutMfa = z
  .object({
    uid: z.guid().openapi({ description: "The member's user id" }),
    email: z.email(),
    role: OrganizationMembershipRole,
    membership_created_at: z.number().openapi({ description: "Unix epoch milliseconds the membership was created" }),
    status: z.enum(["pending", "grace_period", "expired"]).openapi({
      description:
        "`grace_period`: the member may still enable MFA until `grace_period_ends_at`. `expired`: the grace period ended; the membership grants nothing and the enforcement job removes it. `pending`: no grace period was started yet (the enforcement job starts one).",
    }),
    grace_period_reason: OrganizationMfaGracePeriodReason.nullable(),
    grace_period_ends_at: z
      .number()
      .nullable()
      .openapi({ description: "Unix epoch milliseconds the grace period ends; null while none was started" }),
    notified_at: z
      .number()
      .nullable()
      .openapi({ description: "When the member was emailed about the requirement; null until they were" }),
  })
  .openapi("OrganizationMemberWithoutMfa");

/** An organization's MFA requirement as `GET`/`PUT .../mfa-requirement` answer it. */
export const OrganizationMfaRequirement = z
  .object({
    organization_id: organizationIdSchema,
    required: z.boolean().openapi({ description: "Whether the organization requires its members to use MFA" }),
    grace_period_days: OrganizationMfaGracePeriodDays.nullable().openapi({
      description: "Grace period of members without MFA, in days; null when MFA is not required",
    }),
    required_since: z
      .number()
      .nullable()
      .openapi({ description: "Unix epoch milliseconds MFA became required; null when it is not" }),
    updated_at: z
      .number()
      .nullable()
      .openapi({ description: "Unix epoch milliseconds the requirement was last changed; null when MFA is not required" }),
    caller_has_mfa: z.boolean().openapi({ description: "Whether the caller has a verified MFA factor" }),
    members_without_mfa: z
      .array(OrganizationMemberWithoutMfa)
      .readonly()
      .nullable()
      .openapi({
        description:
          "Members without MFA, soonest grace period end first; empty when MFA is not required. Only listed for organization owners and platform administrators (null for other members).",
      }),
  })
  .openapi("OrganizationMfaRequirement");

/** One organization of the caller that requires MFA (`GET /api/me/organization-mfa-requirements`). */
export const MyOrganizationMfaRequirement = z
  .object({
    organization_id: organizationIdSchema,
    organization_name: z.string(),
    grace_period_days: OrganizationMfaGracePeriodDays,
    required_since: z.number().openapi({ description: "Unix epoch milliseconds MFA became required" }),
    status: z.enum(["compliant", "pending", "grace_period", "expired"]).openapi({
      description:
        "`compliant`: the caller has MFA. `grace_period`: the caller must enable MFA before `grace_period_ends_at` to stay a member. `expired`: the grace period ended; the membership is suspended until MFA is enabled, and removed by the next enforcement run. `pending`: the caller has no MFA and no grace period was started yet.",
    }),
    grace_period_reason: OrganizationMfaGracePeriodReason.nullable(),
    grace_period_ends_at: z.number().nullable().openapi({
      description: "Unix epoch milliseconds the caller's grace period ends; null when they have MFA or none was started",
    }),
  })
  .openapi("MyOrganizationMfaRequirement");
