import { z } from "@schemavaults/openapi-operations";

/**
 * Schemas shared by several operations. Each operation's own request /
 * response schemas live next to it in `src/app/api/**\/operation.ts`.
 */

export const timestampField = z
  .number()
  .int()
  .openapi({ description: "Unix epoch milliseconds when the response was produced", example: 1_757_000_000_000 });

export const ErrorResponse = z
  .object({
    success: z.literal(false),
    error: z.string().openapi({ example: "unauthorized" }),
    message: z.string(),
  })
  .openapi("ErrorResponse", {
    description: "Error envelope used by every non-2xx response",
  });

/** The 401 / 403 responses every authenticated operation can produce. */
export const errorResponses = {
  401: { description: "No valid SchemaVaults credential was presented", schema: ErrorResponse },
  403: { description: "The credential is valid but not allowed to perform this operation", schema: ErrorResponse },
} as const;
