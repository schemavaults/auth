import { z, publicAccess } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import {
  TEST_ENVIRONMENT_ONLY_NOTE,
  TEST_ENVIRONMENT_UNAVAILABLE_BODY,
  TestEnvironmentErrorResponse,
} from "@/lib/api/domain-schemas/test-environment";
import { ErrorResponse, validationErrorResponse } from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import { MfaRegistry, UserRegistry } from "@/lib/auth-db";
import { generateRecoveryCodes, generateTotpSecret } from "@/lib/mfa";

/**
 * Test-only helper: enrolls a user with a known TOTP secret + recovery
 * codes so Cypress can compute valid codes at test time without scraping a
 * QR.
 */
export const enrollTestUserMfa = defineOperation({
  method: "post",
  path: "/api/test/seed/enroll-test-user-mfa",
  summary: "Enroll a test user in TOTP MFA",
  description:
    "Replaces every MFA factor of the user with one verified TOTP factor (using `secret` when given, otherwise a fresh one) and a new set of recovery codes, and returns the secret and codes so the E2E suite can compute valid TOTP codes.",
  tags: [API_TAGS.testEnvironment],
  auth: publicAccess(TEST_ENVIRONMENT_ONLY_NOTE),
  request: {
    body: {
      lenientContentType: true,
      schema: z
        .object({
          email: z.string().openapi({ description: "E-mail address of the user to enroll", example: "user@example.com" }),
          secret: z.string().optional().openapi({ description: "Base32 TOTP secret to enroll with; generated when omitted" }),
        })
        .openapi("EnrollTestUserMfaRequest"),
    },
  },
  responses: {
    200: {
      description: "The user is enrolled",
      schema: z
        .object({
          success: z.literal(true),
          uid: z.guid(),
          factor_id: z.string().openapi({ description: "Id of the verified TOTP factor" }),
          secret: z.string().openapi({ description: "Base32 TOTP secret" }),
          recovery_codes: z.array(z.string()).readonly(),
        })
        .openapi("EnrollTestUserMfaResponse"),
    },
    ...validationErrorResponse,
    404: {
      description: "The auth server does not run in the `test` app environment, or no user has that e-mail address",
      schema: z.union([TestEnvironmentErrorResponse, ErrorResponse]),
    },
    500: { description: "The new factor could not be verified", schema: ErrorResponse },
  },
  handler: async (ctx) => {
    const { db, environment } = ctx.context;
    if (environment !== "test") {
      return ctx.json(404, TEST_ENVIRONMENT_UNAVAILABLE_BODY);
    }

    const { email, secret: requestedSecret } = ctx.body;

    const userRegistry = new UserRegistry(db);
    const user = await userRegistry.getUserByEmail(email);
    if (!user) {
      return ctx.json(404, { success: false, message: "User not found" });
    }

    const mfaRegistry = new MfaRegistry(db);
    await mfaRegistry.deleteAllFactorsForUser(user.uid);

    const secret = requestedSecret ?? generateTotpSecret();
    const { factor_id } = await mfaRegistry.createUnverifiedFactor({ uid: user.uid, secret });
    const flipped = await mfaRegistry.verifyFactor({ uid: user.uid, factor_id });
    if (!flipped) {
      return ctx.json(500, { success: false, message: "Failed to verify newly-created factor" });
    }

    const recovery_codes = generateRecoveryCodes();
    await mfaRegistry.replaceRecoveryCodes({ uid: user.uid, codes: recovery_codes });

    return ctx.json(200, { success: true, uid: user.uid, factor_id, secret, recovery_codes });
  },
});
