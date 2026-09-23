import { publicAccess } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import {
  TEST_ENVIRONMENT_ONLY_NOTE,
  TEST_ENVIRONMENT_UNAVAILABLE_BODY,
  TestEnvironmentErrorResponse,
  testEnvironmentUnavailableResponse,
  TestTokenResponse,
  testUserEmailParams,
} from "@/lib/api/domain-schemas/test-environment";
import { API_TAGS } from "@/lib/api/tags";
import { UserRegistry, type UserDocument } from "@/lib/auth-db";

/**
 * Test-only endpoint that creates an email verification token for a user
 * and returns the raw token directly (bypassing email sending). This
 * allows E2E tests to exercise the email verification flow without needing
 * to mock or intercept emails.
 */
export const getTestEmailVerificationToken = defineOperation({
  method: "get",
  path: "/api/test/email-verification-token/{email}",
  summary: "Mint an e-mail verification token",
  description:
    "Creates an e-mail verification token for the user with the given e-mail address and returns it raw instead of e-mailing it, so the E2E suite can drive the verification flow without intercepting mail.",
  tags: [API_TAGS.testEnvironment],
  auth: publicAccess(TEST_ENVIRONMENT_ONLY_NOTE),
  request: { params: testUserEmailParams },
  responses: {
    200: { description: "The raw verification token", schema: TestTokenResponse },
    400: { description: "The e-mail parameter is empty", schema: TestEnvironmentErrorResponse },
    404: {
      description: `${testEnvironmentUnavailableResponse[404].description}, or no user has that e-mail address`,
      schema: TestEnvironmentErrorResponse,
    },
    500: { description: "The token could not be created", schema: TestEnvironmentErrorResponse },
  },
  handler: async (ctx) => {
    if (ctx.context.environment !== "test") {
      return ctx.json(404, TEST_ENVIRONMENT_UNAVAILABLE_BODY);
    }

    const email: string = decodeURIComponent(ctx.params.email);
    if (!email || typeof email !== "string") {
      return ctx.json(400, { error: true, success: false, message: "Missing email parameter" });
    }

    const userRegistry = new UserRegistry(ctx.context.db, true);

    const user: UserDocument | null = await userRegistry.getUserByEmail(email);
    if (!user) {
      return ctx.json(404, { error: true, success: false, message: `User not found: ${email}` });
    }

    try {
      const rawToken: string = await userRegistry.createEmailVerificationToken(user.uid);
      return ctx.json(200, { error: false, success: true, token: rawToken });
    } catch (e: unknown) {
      console.error("[test/email-verification-token] Failed to create token:", e);
      return ctx.json(500, {
        error: true,
        success: false,
        message: "Failed to create email verification token",
      });
    }
  },
});
