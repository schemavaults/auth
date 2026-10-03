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
    `Reports are rate limited per IP; bodies over ${CLIENT_ERROR_REPORT_LIMITS.max_body_bytes / 1024} KiB are refused with 413. The page URL is stored without its query string or fragment.`,
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
      description: "The `Origin` is not registered for the app, or a web app sent no `Origin`",
      schema: ErrorResponse,
    },
    404: { description: "No such app", schema: ErrorResponse },
    413: { description: `The request body exceeds ${CLIENT_ERROR_REPORT_LIMITS.max_body_bytes / 1024} KiB`, schema: ErrorResponse },
    429: { description: "Rate limited", schema: RateLimitedResponse },
    500: { description: "The report could not be stored", schema: ErrorResponse },
  },
  handler: async (ctx) => {
    const { client_app_id } = ctx.params;
    const report = ctx.body;

    const row: NewClientErrorRow = {
      client_error_id: crypto.randomUUID(),
      created_at: Date.now(),
      occurred_at: report.occurred_at ?? null,
      client_app_id,
      fingerprint: computeClientErrorFingerprint(report),
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

    return ctx.json(202, {
      success: true,
      message: "Client error report received",
      client_error_id: row.client_error_id,
    });
  },
});
