import { z } from "@schemavaults/openapi-operations";

/**
 * Schemas shared by the operations of the "Test environment" domain
 * (`/api/test/**`): seeding and introspection endpoints for the Cypress E2E
 * suite. Every one of them answers 404 unless the app environment is
 * `test`.
 */

/** The `auth.notes` of every test-environment operation. */
export const TEST_ENVIRONMENT_ONLY_NOTE =
  "Only available when the app environment is `test`; 404 otherwise.";

/** The body every test-environment endpoint answers with outside the `test` environment. */
export const TEST_ENVIRONMENT_UNAVAILABLE_BODY = {
  error: true,
  success: false,
  message: "Route not available in this environment",
} as const;

/** `{ error: true, success: false, message }`: the failure envelope of the test endpoints. */
export const TestEnvironmentErrorResponse = z
  .object({
    error: z.literal(true),
    success: z.literal(false),
    message: z.string(),
  })
  .openapi("TestEnvironmentErrorResponse", {
    description: "Failure envelope of the test-environment endpoints (also the 404 sent outside the `test` environment).",
    example: TEST_ENVIRONMENT_UNAVAILABLE_BODY,
  });

/** `{ error: false, success: true, message }` acknowledgements of the test endpoints. */
export const TestEnvironmentAcknowledgement = z
  .object({
    error: z.literal(false),
    success: z.literal(true),
    message: z.string(),
  })
  .openapi("TestEnvironmentAcknowledgement");

/** The 404 every test-environment operation answers outside the `test` environment. */
export const testEnvironmentUnavailableResponse = {
  404: {
    description: "The auth server does not run in the `test` app environment",
    schema: TestEnvironmentErrorResponse,
  },
} as const;

/** `{email}` path parameter of the token-introspection test endpoints. */
export const testUserEmailParams = z.object({
  email: z.string().openapi({
    description: "URL-encoded e-mail address of an existing user",
    example: "user%40example.com",
  }),
});

/** A raw one-time token handed straight to the E2E suite instead of being e-mailed. */
export const TestTokenResponse = z
  .object({
    error: z.literal(false),
    success: z.literal(true),
    token: z.string().openapi({ description: "The raw (unhashed) token, exactly as the e-mail link would carry it" }),
  })
  .openapi("TestTokenResponse");
