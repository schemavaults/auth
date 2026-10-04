import {
  CLIENT_ERROR_REPORT_LIMITS,
  type ClientErrorReport,
} from "@schemavaults/auth-common";
import type { SchemaVaultsAppEnvironment } from "@schemavaults/app-definitions";

/** Package name the SDK's reports carry as `sdk_name`. */
export const AUTH_CLIENT_SDK_NAME = "@schemavaults/auth-client-sdk" as const;

/** How many `cause` links are appended to a report's stack trace. */
const MAX_CAUSE_DEPTH: number = 3;

const UUID_REGEX: RegExp =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ReportErrorOptions {
  /** What the app was doing, e.g. `checkout` (the SDK uses its method names). */
  operation?: string;
  /** Extra JSON-serializable details; dropped when larger than the server accepts. */
  context?: Record<string, unknown>;
}

export interface ClientErrorReportEnvironment {
  sdk_version: string;
  app_env: SchemaVaultsAppEnvironment;
  /** Absolute URL of the current page, when there is one. */
  page_url?: string;
  /** The signed-in user's uid, when known. */
  uid?: string | null;
  /** Unix epoch ms. */
  now: number;
}

function truncate(value: string, max_length: number): string {
  return value.length <= max_length ? value : `${value.slice(0, max_length - 1)}…`;
}

function stringifyThrown(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

/** The name, message and stack of a thrown value (an `Error` or anything else). */
function describeThrown(value: unknown): { name: string; message: string; stack?: string } {
  if (value instanceof Error) {
    return { name: value.name || "Error", message: value.message, stack: value.stack };
  }
  return { name: "UnknownError", message: stringifyThrown(value) };
}

/**
 * The error's stack with its `cause` chain appended as `Caused by:`
 * sections (the SDK wraps low-level failures, so the root cause is usually
 * in the chain).
 */
function stackWithCauses(error: unknown): string | undefined {
  const sections: string[] = [];
  let current: unknown = error;
  for (let depth = 0; depth <= MAX_CAUSE_DEPTH && current !== undefined && current !== null; depth++) {
    const { name, message, stack } = describeThrown(current);
    const section: string = stack ?? `${name}: ${message}`;
    sections.push(depth === 0 ? section : `Caused by: ${section}`);
    current = current instanceof Error ? current.cause : undefined;
  }
  if (sections.length === 1 && !(error instanceof Error && error.stack)) {
    return undefined;
  }
  return sections.join("\n");
}

/**
 * `context` made safe to send: JSON round-tripped (functions, symbols and
 * undefined values dropped), and replaced with a note when it cannot be
 * serialized or exceeds the server's limit.
 */
function sanitizeContext(context: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!context) return undefined;
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(context);
  } catch {
    return { context_dropped: "not JSON-serializable" };
  }
  if (serialized === undefined) return undefined;
  if (serialized.length > CLIENT_ERROR_REPORT_LIMITS.context_json) {
    return { context_dropped: `larger than ${CLIENT_ERROR_REPORT_LIMITS.context_json} characters` };
  }
  return JSON.parse(serialized) as Record<string, unknown>;
}

/** Origin and path of `page_url`: query strings and fragments of auth callbacks carry codes and tokens. */
export function stripPageUrl(page_url: string | undefined): string | undefined {
  if (!page_url) return undefined;
  try {
    const url = new URL(page_url);
    if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
    return truncate(`${url.origin}${url.pathname}`, CLIENT_ERROR_REPORT_LIMITS.page_url);
  } catch {
    return undefined;
  }
}

/** The report `POST /api/client-errors/{client_app_id}` accepts for `error`, within its size limits. */
export function buildClientErrorReport(
  error: unknown,
  options: ReportErrorOptions,
  environment: ClientErrorReportEnvironment,
): ClientErrorReport {
  const L = CLIENT_ERROR_REPORT_LIMITS;
  const { name, message } = describeThrown(error);
  const stack: string | undefined = stackWithCauses(error);
  const operation: string | undefined = options.operation?.trim() || undefined;
  const page_url: string | undefined = stripPageUrl(environment.page_url);
  const context: Record<string, unknown> | undefined = sanitizeContext(options.context);
  const uid: string | null | undefined = environment.uid;

  return {
    name: truncate(name, L.name),
    message: truncate(message, L.message),
    ...(stack ? { stack: truncate(stack, L.stack) } : {}),
    ...(operation ? { operation: truncate(operation, L.operation) } : {}),
    occurred_at: Math.max(0, Math.floor(environment.now)),
    sdk_name: AUTH_CLIENT_SDK_NAME,
    sdk_version: truncate(environment.sdk_version, L.sdk_version),
    app_env: environment.app_env,
    ...(page_url ? { page_url } : {}),
    ...(uid && UUID_REGEX.test(uid) ? { reported_uid: uid } : {}),
    ...(context ? { context } : {}),
  };
}
