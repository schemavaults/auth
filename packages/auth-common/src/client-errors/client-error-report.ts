import { z } from "zod";
import { schemaVaultsAppEnvironmentSchema } from "@schemavaults/app-definitions";

/**
 * Size limits of a client error report. The client SDK truncates its
 * reports to fit them; the auth server refuses a report that exceeds any of
 * them (400) and any request body over `max_body_bytes` (413).
 */
export const CLIENT_ERROR_REPORT_LIMITS = {
  name: 200,
  message: 2_000,
  stack: 16_000,
  operation: 200,
  sdk_name: 100,
  sdk_version: 64,
  page_url: 2_048,
  /** Length of `JSON.stringify(context)`. */
  context_json: 8_192,
  /** Request body size accepted by `POST /api/client-errors/{client_app_id}`. */
  max_body_bytes: 64 * 1024,
} as const;

/**
 * Whether `JSON.stringify(value)` fits in `max_length` characters. A value
 * that cannot be serialized (cycles, BigInt) does not fit.
 */
function fitsAsJson(value: unknown, max_length: number): boolean {
  try {
    const serialized: string | undefined = JSON.stringify(value);
    return typeof serialized === "string" && serialized.length <= max_length;
  } catch {
    return false;
  }
}

const L = CLIENT_ERROR_REPORT_LIMITS;

/**
 * One error a client (the auth client SDK, or an app through
 * `SchemaVaultsAuthClient.reportError()`) sends to
 * `POST /api/client-errors/{client_app_id}`. The client app is the path
 * parameter; the server records the `Origin`, `User-Agent` and receive
 * time itself. Unknown members are ignored.
 */
export const clientErrorReportSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(L.name)
    .describe("The error's class name (`Error`, `TypeError`, ...)."),
  message: z.string().max(L.message).describe("The error message."),
  stack: z
    .string()
    .max(L.stack)
    .optional()
    .describe("Stack trace, with the `cause` chain appended as `Caused by:` sections."),
  operation: z
    .string()
    .min(1)
    .max(L.operation)
    .optional()
    .describe("What the client was doing, e.g. the SDK method (`acquireAccessToken`)."),
  occurred_at: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe("When the error happened on the client (Unix epoch milliseconds)."),
  sdk_name: z
    .string()
    .min(1)
    .max(L.sdk_name)
    .optional()
    .describe("Package that sent the report, e.g. `@schemavaults/auth-client-sdk`."),
  sdk_version: z.string().min(1).max(L.sdk_version).optional().describe("Version of `sdk_name`."),
  app_env: schemaVaultsAppEnvironmentSchema
    .optional()
    .describe("Environment the client app runs in."),
  page_url: z
    .string()
    .max(L.page_url)
    .optional()
    .describe("Page the error happened on. The server keeps only its origin and path."),
  reported_uid: z
    .guid()
    .optional()
    .describe("The signed-in user as the client knows it. Reported by the client, not verified."),
  context: z
    .record(z.string(), z.unknown())
    .refine((value) => fitsAsJson(value, L.context_json), {
      message: `context must serialize to at most ${L.context_json} characters of JSON`,
    })
    .optional()
    .describe(`Extra structured details (at most ${L.context_json} characters as JSON).`),
});

export type ClientErrorReport = z.infer<typeof clientErrorReportSchema>;
