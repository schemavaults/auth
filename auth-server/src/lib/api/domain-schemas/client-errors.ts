import { clientErrorReportSchema } from "@schemavaults/auth-common";
import { appIdSchema } from "@schemavaults/app-definitions";
import { z, withOpenApi } from "@schemavaults/openapi-operations";
import { CLIENT_ERROR_FINGERPRINT_REGEX } from "@/lib/client-errors/fingerprint";
import {
  CLIENT_ERRORS_DEFAULT_LIMIT,
  CLIENT_ERRORS_MAX_LIMIT,
  CLIENT_ERROR_SEARCH_MAX_LENGTH,
} from "@/lib/client-errors/client-error-page-filters";

/**
 * Schemas shared by the client error operations: the public report intake
 * (`POST /api/client-errors/{client_app_id}`) and the administrator
 * browsing endpoints (`/api/admin/client-errors/**`).
 */

/** `ClientErrorReport` from @schemavaults/auth-common, named for the document. */
export const ClientErrorReport = withOpenApi(clientErrorReportSchema, "ClientErrorReport", {
  description:
    "One error a client application reports. The auth client SDK sends these unless the app sets `disable_telemetry`; apps can send their own through `SchemaVaultsAuthClient.reportError()`.",
});

export const ClientErrorReportAccepted = z
  .object({
    success: z.literal(true),
    message: z.string(),
    client_error_id: z.guid().openapi({ description: "Id of the stored report" }),
  })
  .openapi("ClientErrorReportAccepted");

const epochMs = (description: string) => z.number().int().nonnegative().openapi({ description });

/** A row of CLIENT_ERRORS. */
export const AdminClientError = z
  .object({
    client_error_id: z.guid(),
    created_at: epochMs("When the server received the report (Unix epoch milliseconds)"),
    occurred_at: epochMs("When the error happened, as the client reported it (Unix epoch milliseconds)").nullable(),
    client_app_id: z.string().openapi({ example: "my-web-app" }),
    fingerprint: z.string().openapi({ description: "Groups reports of the same error" }),
    name: z.string().openapi({ example: "TypeError" }),
    message: z.string(),
    stack: z.string().nullable(),
    operation: z.string().nullable().openapi({ example: "acquireAccessToken" }),
    sdk_name: z.string().nullable().openapi({ example: "@schemavaults/auth-client-sdk" }),
    sdk_version: z.string().nullable(),
    app_env: z.string().nullable(),
    page_url: z.string().nullable().openapi({ description: "Origin and path of the page (no query string or fragment)" }),
    origin: z.string().nullable().openapi({ description: "The report request's `Origin` header" }),
    user_agent: z.string().nullable().openapi({ description: "The report request's `User-Agent` header" }),
    reported_uid: z.string().nullable().openapi({ description: "The signed-in user as the client reported it (not verified)" }),
    context: z.record(z.string(), z.unknown()).nullable(),
  })
  .openapi("AdminClientError");

export const AdminClientErrorStats = z
  .object({
    window: z.object({
      from: epochMs("Start of the timeline"),
      to: epochMs("End of the timeline (the time of the request)"),
      bucket_ms: z.number().int().positive().openapi({ description: "Width of one timeline bucket" }),
    }),
    totals: z.object({
      errors: z.number().int().nonnegative(),
      groups: z.number().int().nonnegative().openapi({ description: "Distinct fingerprints" }),
      apps: z.number().int().nonnegative(),
      users: z.number().int().nonnegative().openapi({ description: "Distinct reported users" }),
      first_seen: epochMs("Oldest matching report").nullable(),
      last_seen: epochMs("Newest matching report").nullable(),
      previous_period_errors: z.number().int().nonnegative().nullable().openapi({
        description: "Matching errors in the window of the same length right before `since` (null without `since`)",
      }),
    }),
    timeline: z.array(z.object({ start: epochMs("Bucket start"), count: z.number().int().nonnegative() })),
    top_groups: z.array(
      z.object({
        fingerprint: z.string(),
        name: z.string(),
        message: z.string().openapi({ description: "Message of the group's most recent error" }),
        operation: z.string().nullable(),
        latest_client_error_id: z.guid(),
        count: z.number().int().nonnegative(),
        apps: z.number().int().nonnegative(),
        users: z.number().int().nonnegative(),
        first_seen: epochMs("Oldest report of the group"),
        last_seen: epochMs("Newest report of the group"),
      }),
    ),
    by_app: z.array(
      z.object({
        client_app_id: z.string(),
        count: z.number().int().nonnegative(),
        groups: z.number().int().nonnegative(),
        last_seen: epochMs("Newest report of the app"),
      }),
    ),
    by_sdk_version: z.array(
      z.object({
        sdk_name: z.string().nullable(),
        sdk_version: z.string().nullable(),
        count: z.number().int().nonnegative(),
      }),
    ),
    by_operation: z.array(z.object({ operation: z.string().nullable(), count: z.number().int().nonnegative() })),
  })
  .openapi("AdminClientErrorStats");

/** The query filters shared by the listing and the stats endpoints. */
export const clientErrorFilterQuerySchema = z.object({
  since: z
    .string()
    .min(1)
    .pipe(z.coerce.number<string>().int().nonnegative())
    .optional()
    .openapi({
      description: "Only errors received at or after this instant (a non-negative integer Unix epoch in milliseconds).",
      example: "1735689600000",
    }),
  client_app_id: withOpenApi(appIdSchema.optional(), { description: "Only errors of this client app", example: "my-web-app" }),
  fingerprint: z
    .string()
    .regex(CLIENT_ERROR_FINGERPRINT_REGEX)
    .optional()
    .openapi({ description: "Only errors of this group (32 lowercase hex characters)" }),
  q: z
    .string()
    .min(1)
    .max(CLIENT_ERROR_SEARCH_MAX_LENGTH)
    .optional()
    .openapi({ description: "Only errors whose name, message or operation contains this text (case-insensitive)" }),
});

export const clientErrorPageQuerySchema = clientErrorFilterQuerySchema.extend({
  limit: z
    .string()
    .min(1)
    .pipe(z.coerce.number<string>().int().min(1).max(CLIENT_ERRORS_MAX_LIMIT))
    .optional()
    .openapi({
      description: `Page size (1–${CLIENT_ERRORS_MAX_LIMIT}, default ${CLIENT_ERRORS_DEFAULT_LIMIT}).`,
      example: "50",
    }),
  offset: z
    .string()
    .min(1)
    .pipe(z.coerce.number<string>().int().nonnegative())
    .optional()
    .openapi({ description: "Matching errors to skip, newest first (default 0).", example: "0" }),
});
