import "server-only";
import { appIdSchema } from "@schemavaults/app-definitions";
import { CLIENT_ERROR_REPORT_LIMITS } from "@schemavaults/auth-common";
import { publicAccess, z, withOpenApi } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { ClientErrorReport, ClientErrorReportAccepted } from "@/lib/api/domain-schemas/client-errors";
import { ErrorResponse, RateLimitedResponse, validationErrorResponse } from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import { insertClientError, type NewClientErrorRow } from "@/lib/auth-db/client-errors";
import captureServerException from "@/lib/captureServerException";
import { computeClientErrorFingerprint, sanitizeReportedPageUrl } from "@/lib/client-errors/fingerprint";
import {
  loadClientErrorIntakeSettings,
  purgeExpiredClientErrors,
  recordStoredClientErrorBytes,
} from "@/lib/client-errors/intake-policy";
import { type ClientErrorRowContents, estimateClientErrorRowBytes } from "@/lib/client-errors/row-size";

const ROUTE = "/api/client-errors/{client_app_id}";

/** Longest `Origin` / `User-Agent` header value stored with a report. */
const MAX_STORED_HEADER_LENGTH: number = 1_024;

function headerValue(request: Request, name: string): string | null {
  const value: string | null = request.headers.get(name);
  return value ? value.slice(0, MAX_STORED_HEADER_LENGTH) : null;
}

export const reportClientError = defineOperation({
  method: "post",
  path: ROUTE,
  summary: "Report a client error",
  description:
    "Error reporting intake for client applications. The auth client SDK (`@schemavaults/auth-client-sdk`) reports the errors of its own flows here unless the app sets `disable_telemetry: true`; apps can report their own through `reportError()`. Administrators browse the reports on `/admin/client-errors`.\n\n" +
    "CORS follows the app's registered origins: a report from a browser must come from an origin registered for `client_app_id` in this environment (403 otherwise) and its response carries the CORS headers; web apps must send an `Origin`, native apps may omit it. The body may be labelled `text/plain` (a CORS simple request, which the SDK uses to skip the preflight); answer `OPTIONS` for callers that send `application/json`. " +
    `Reports are rate limited per IP and per app (429); bodies over ${CLIENT_ERROR_REPORT_LIMITS.max_body_bytes / 1024} KiB are refused with 413. The page URL is stored without its query string or fragment.\n\n` +
    "Administrators control the intake with server settings: `accept_client_error_reports` (while off: 403 with `error: \"client_error_reporting_disabled\"`), `client_error_reports_max_storage_mb` (once the stored reports reach it: 503 with `error: \"client_error_storage_full\"` and `Retry-After`) and `client_error_reports_retention_days` (older reports are deleted automatically). Refusals made before the origin check (intake off, IP rate limit) carry `Access-Control-Allow-Origin: *`; `Retry-After` is exposed to cross-origin callers.",
  tags: [API_TAGS.telemetry],
  auth: publicAccess("Needs no credentials: the report is attributed to `client_app_id` after the `Origin` check."),
  request: {
    params: z.object({
      client_app_id: withOpenApi(appIdSchema, { description: "Client application the error happened in", example: "my-web-app" }),
    }),
    body: { contentType: "application/json", schema: ClientErrorReport, lenientContentType: true },
  },
  responses: {
    202: { description: "The report was stored", schema: ClientErrorReportAccepted },
    ...validationErrorResponse,
    403: {
      description:
        "Client error reporting is disabled (`client_error_reporting_disabled`), the `Origin` is not registered for the app, or a web app sent no `Origin`",
      schema: ErrorResponse,
    },
    404: { description: "No such app", schema: ErrorResponse },
    413: { description: `The request body exceeds ${CLIENT_ERROR_REPORT_LIMITS.max_body_bytes / 1024} KiB`, schema: ErrorResponse },
    429: { description: "Rate limited (per IP or per app)", schema: RateLimitedResponse },
    500: { description: "The report could not be stored", schema: ErrorResponse },
    503: {
      description: "The stored reports reached the configured storage limit (`client_error_storage_full`); retry after `Retry-After`",
      schema: ErrorResponse,
    },
  },
  handler: async (ctx) => {
    const { client_app_id } = ctx.params;
    const report = ctx.body;

    const contents: ClientErrorRowContents = {
      client_app_id,
      name: report.name,
      message: report.message,
      stack: report.stack ?? null,
      operation: report.operation ?? null,
      sdk_name: report.sdk_name ?? null,
      sdk_version: report.sdk_version ?? null,
      app_env: report.app_env ?? null,
      page_url: sanitizeReportedPageUrl(report.page_url),
      origin: headerValue(ctx.request, "Origin"),
      user_agent: headerValue(ctx.request, "User-Agent"),
      reported_uid: report.reported_uid ?? null,
      context: report.context ?? null,
    };
    const row: NewClientErrorRow = {
      ...contents,
      client_error_id: crypto.randomUUID(),
      created_at: Date.now(),
      occurred_at: report.occurred_at ?? null,
      fingerprint: computeClientErrorFingerprint(report),
      size_bytes: estimateClientErrorRowBytes(contents),
    };

    try {
      await insertClientError(ctx.context.db, row);
    } catch (e: unknown) {
      await captureServerException(ctx.context.db, e, {
        op_name: "POST_client_errors_handler.insertClientError",
        route: ROUTE,
        context: { client_app_id },
      });
      return ctx.json(500, { success: false, message: "Failed to store the client error report" });
    }

    const { db, redis } = ctx.context;
    await recordStoredClientErrorBytes(redis.client, row.size_bytes ?? 0);
    try {
      const { retention_days } = await loadClientErrorIntakeSettings(db, redis.client);
      await purgeExpiredClientErrors(db, redis.client, retention_days);
    } catch (e: unknown) {
      console.error("[POST /api/client-errors] Retention check failed:", e);
    }

    return ctx.json(202, {
      success: true,
      message: "Client error report received",
      client_error_id: row.client_error_id,
    });
  },
});
