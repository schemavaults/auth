import { z } from "../zod-openapi";
import type { OperationErrorBody, OperationValidationIssue } from "./errors";

/**
 * One request-validation issue as reported on `validation_error` bodies.
 * Registered under `components.schemas.OperationValidationIssue`.
 */
export const OperationValidationIssueSchema = z
  .object({
    location: z.enum(["params", "query", "headers", "body"]).openapi({
      description: "Which part of the request failed validation.",
    }),
    path: z.string().openapi({
      description: "Dotted path of the offending field within that part (empty for the whole part).",
      example: "name",
    }),
    message: z.string().openapi({ example: "Invalid input: expected string, received undefined" }),
    code: z.string().openapi({ description: "zod issue code.", example: "invalid_type" }),
  })
  .openapi("OperationValidationIssue");

/**
 * The `{ success: false, error, message }` envelope of every error response
 * the operations runtime produces (validation, authentication, authorization,
 * unsupported media type, unexpected failures) and of every
 * `OperationError` thrown by a handler or auth resolver. Registered under
 * `components.schemas.OperationError`; declare it on the 404 / 409 / ...
 * responses a handler produces with `new OperationError(status, ...)`.
 */
export const OperationErrorBodySchema = z
  .object({
    success: z.literal(false),
    error: z.string().openapi({
      description: "Machine readable error code.",
      example: "validation_error",
    }),
    message: z.string().openapi({
      description: "Human readable explanation.",
      example: "Invalid request body",
    }),
    issues: z.array(OperationValidationIssueSchema).optional().openapi({
      description: "Present on `validation_error` responses.",
    }),
    details: z.record(z.string(), z.unknown()).optional().openapi({
      description: "Extra machine readable details (e.g. the missing scopes on `insufficient_scope`).",
    }),
  })
  .openapi("OperationError");

// The schema and the runtime type must not drift apart: what the schema
// accepts must be a valid OperationErrorBody (the reverse holds up to the
// readonly modifiers of the runtime type).
type _AssertSchemaMatchesBody = z.output<typeof OperationErrorBodySchema> extends OperationErrorBody
  ? true
  : never;
type _AssertIssueMatches = z.output<typeof OperationValidationIssueSchema> extends OperationValidationIssue
  ? true
  : never;
const _schemaMatchesBody: _AssertSchemaMatchesBody = true;
const _issueMatches: _AssertIssueMatches = true;
void _schemaMatchesBody;
void _issueMatches;
