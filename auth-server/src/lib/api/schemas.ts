import { z } from "@schemavaults/openapi-operations";

/**
 * Response envelopes shared by many operations. Operation-specific schemas
 * live next to the operation in `src/app/api/**\/operation.ts`.
 */

/** `{ success: false, message }`: the error envelope of every management endpoint. */
export const ErrorResponse = z
  .object({
    success: z.literal(false),
    message: z.string(),
    /**
     * Machine readable error code on responses produced by the operations
     * runtime (validation, auth); handler-produced errors may omit it.
     */
    error: z.union([z.string(), z.boolean()]).optional(),
  })
  .openapi("ErrorResponse", {
    description: "Error envelope: `success` is false and `message` explains why.",
  });

/** `{ success: true, message }` acknowledgements. */
export const SuccessMessageResponse = z
  .object({ success: z.literal(true), message: z.string() })
  .openapi("SuccessMessageResponse");

/** `ResourceCreationResponse` from `@/lib/auth-db/resource-creation-response`. */
export const ResourceCreationResponse = z
  .object({
    success: z.literal(true),
    message: z.string(),
    resource_id: z.string().openapi({ description: "Identifier of the created / affected resource" }),
  })
  .openapi("ResourceCreationResponse");

/** Validation failure produced by the operations runtime (400). */
export const ValidationErrorResponse = z
  .object({
    success: z.literal(false),
    error: z.literal("validation_error"),
    message: z.string(),
    issues: z.array(
      z.object({
        location: z.enum(["params", "query", "headers", "body"]),
        path: z.string(),
        message: z.string(),
        code: z.string(),
      }),
    ),
  })
  .openapi("ValidationErrorResponse");

export const RateLimitedResponse = z
  .object({ success: z.literal(false), message: z.string() })
  .openapi("RateLimitedResponse", {
    description:
      "Too many requests. Carries `Retry-After` and `X-RateLimit-*` headers.",
  });

/** The 401 / 403 responses every session-guarded operation can produce. */
export const sessionErrorResponses = {
  401: {
    description:
      "No valid session cookie, access token cookie or bearer access token was presented, or the token was revoked",
    schema: ErrorResponse,
  },
  403: {
    description:
      "The account is disabled, or the credential is valid but not allowed to perform this operation",
    schema: ErrorResponse,
  },
} as const;

/** The 401 / 403 responses of administrator-only operations. */
export const adminErrorResponses = {
  401: sessionErrorResponses[401],
  403: {
    description: "The caller is not a platform administrator",
    schema: ErrorResponse,
  },
} as const;

/**
 * A 400 produced either by the runtime (validation, with `issues`) or by
 * the handler itself (plain error envelope).
 */
export const BadRequestResponse = z
  .union([ValidationErrorResponse, ErrorResponse])
  .openapi("BadRequestResponse");

export const validationErrorResponse = {
  400: {
    description:
      "The request failed validation (`issues` lists the offending fields) or was refused by the handler",
    schema: BadRequestResponse,
  },
} as const;

export const internalErrorResponse = {
  500: { description: "Unexpected server failure", schema: ErrorResponse },
} as const;
