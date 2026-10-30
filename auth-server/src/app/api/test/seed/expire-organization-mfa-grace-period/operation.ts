import { organizationIdSchema } from "@schemavaults/auth-common";
import { z, publicAccess } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import {
  TEST_ENVIRONMENT_ONLY_NOTE,
  TEST_ENVIRONMENT_UNAVAILABLE_BODY,
  TestEnvironmentErrorResponse,
} from "@/lib/api/domain-schemas/test-environment";
import { ErrorResponse, validationErrorResponse } from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import { UserRegistry } from "@/lib/auth-db";

/**
 * Test-only helper: ends a member's MFA grace period now, so the E2E suite
 * can exercise a lapsed grace period (suspended membership, removal by the
 * enforcement job) without waiting days.
 */
export const expireTestOrganizationMfaGracePeriod = defineOperation({
  method: "post",
  path: "/api/test/seed/expire-organization-mfa-grace-period",
  summary: "End a member's MFA grace period",
  description:
    "Moves the end of the user's grace period in the organization (see `PUT /api/organizations/{organization_id}/mfa-requirement`) to one millisecond ago.",
  tags: [API_TAGS.testEnvironment],
  auth: publicAccess(TEST_ENVIRONMENT_ONLY_NOTE),
  request: {
    body: {
      lenientContentType: true,
      schema: z
        .object({
          email: z.string().openapi({ description: "E-mail address of the member", example: "user@example.com" }),
          organization_id: organizationIdSchema,
        })
        .openapi("ExpireTestOrganizationMfaGracePeriodRequest"),
    },
  },
  responses: {
    200: {
      description: "The grace period ended",
      schema: z
        .object({ success: z.literal(true), ends_at: z.number() })
        .openapi("ExpireTestOrganizationMfaGracePeriodResponse"),
    },
    ...validationErrorResponse,
    404: {
      description:
        "The auth server does not run in the `test` app environment, no user has that e-mail address, or they have no grace period in the organization",
      schema: z.union([TestEnvironmentErrorResponse, ErrorResponse]),
    },
  },
  handler: async (ctx) => {
    const { db, environment } = ctx.context;
    if (environment !== "test") {
      return ctx.json(404, TEST_ENVIRONMENT_UNAVAILABLE_BODY);
    }

    const { email, organization_id } = ctx.body;
    const user = await new UserRegistry(db).getUserByEmail(email);
    if (!user) {
      return ctx.json(404, { success: false, message: "User not found" });
    }

    const ends_at: number = Date.now() - 1;
    const result = await db
      .updateTable("organization_mfa_grace_periods")
      .set({ ends_at })
      .where("organization_id", "=", organization_id)
      .where("uid", "=", user.uid)
      .executeTakeFirst();
    if (!result || result.numUpdatedRows === BigInt(0)) {
      return ctx.json(404, { success: false, message: "The user has no grace period in this organization" });
    }
    return ctx.json(200, { success: true, ends_at });
  },
});
