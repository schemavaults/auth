import "server-only";
import type { Kysely, Transaction } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import type { NewErrorRow } from "@/lib/auth-db/errors";

export interface CaptureServerExceptionOptions {
  op_name?: string;
  route?: string;
  uid?: string;
  context?: unknown;
}

// Persists a caught exception to the ERRORS table for later triage on
// /admin/errors. Contract: this function MUST NOT throw. If the sink write
// fails for any reason, we fall back to console.error so a broken logger
// never masks the original exception.
//
// Do not pass a transaction that the caller is about to roll back: the
// ERRORS row is rolled back with it.
export async function captureServerException(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
  err: unknown,
  opts: CaptureServerExceptionOptions = {},
): Promise<void> {
  try {
    const row: NewErrorRow = buildErrorRow(err, opts);
    await db.insertInto("errors").values(row).execute();
  } catch (sinkErr: unknown) {
    console.error("captureServerException failed to persist error:", sinkErr);
    console.error("original error:", err);
  }
}

const UUID_PATTERN: RegExp = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** How many levels of `cause` / `AggregateError.errors` end up in `stack`. */
const MAX_CAUSE_DEPTH = 5;

/** How deep `context` / error details are serialized before being cut off. */
const MAX_JSON_DEPTH = 8;

// Properties every error has (or that are rendered through `stack` instead),
// so they are not repeated as error details.
const NON_DETAIL_PROPERTIES: ReadonlySet<string> = new Set([
  "name",
  "message",
  "stack",
  "cause",
  "errors",
]);

/**
 * The ERRORS row for `err`. Built so that the insert cannot fail on the
 * error's own contents:
 *
 * - `stack` also renders the `cause` chain and the members of an
 *   `AggregateError`, which `Error.prototype.stack` leaves out;
 * - the error's own properties (Postgres' `code` / `detail` / `constraint`,
 *   Node's `code` / `syscall`, ...) are kept as `context.error_details`;
 * - `context` is bound as JSON text (a JS array would be sent as a Postgres
 *   array literal, which JSONB rejects) after replacing what JSON cannot
 *   hold (bigints, cycles, functions);
 * - NUL characters, which Postgres TEXT and JSONB reject, are replaced;
 * - a `uid` that is not a uuid (the UUID column would reject it) moves
 *   into `context.uid`.
 */
export function buildErrorRow(
  err: unknown,
  opts: CaptureServerExceptionOptions = {},
): NewErrorRow {
  const uid: string | null =
    typeof opts.uid === "string" && UUID_PATTERN.test(opts.uid) ? opts.uid : null;
  const details: Record<string, unknown> | null = errorDetails(err);

  let context: unknown = opts.context ?? null;
  const extra: Record<string, unknown> = {
    ...(details ? { error_details: details } : {}),
    ...(opts.uid !== undefined && uid === null ? { uid: opts.uid } : {}),
  };
  if (Object.keys(extra).length > 0) {
    context = isPlainObject(context)
      ? { ...context, ...extra }
      : { ...(context === null ? {} : { context }), ...extra };
  }

  return {
    error_id: crypto.randomUUID(),
    created_at: Date.now(),
    name: stripNul(isErrorLike(err) ? err.name || "Error" : "UnknownError"),
    message: stripNul(
      isErrorLike(err) ? err.message : typeof err === "string" ? err : safeStringify(err),
    ),
    stack: isErrorLike(err) ? stripNul(describeErrorChain(err)) : null,
    op_name: opts.op_name === undefined ? null : stripNul(opts.op_name),
    route: opts.route === undefined ? null : stripNul(opts.route),
    uid,
    context: context === null ? null : toJsonText(context),
  };
}

interface ErrorLike {
  name: string;
  message: string;
  stack?: string;
  cause?: unknown;
}

// Duck-typed so errors from another realm (or plain `{ name, message }`
// objects some libraries throw) are still recorded as errors.
function isErrorLike(value: unknown): value is ErrorLike {
  if (value instanceof Error) return true;
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { name?: unknown; message?: unknown };
  return typeof candidate.name === "string" && typeof candidate.message === "string";
}

function headline(err: ErrorLike): string {
  return typeof err.stack === "string" && err.stack.length > 0
    ? err.stack
    : `${err.name || "Error"}: ${err.message}`;
}

function describeUnknown(value: unknown): string {
  if (isErrorLike(value)) {
    const details = errorDetails(value);
    return details ? `${headline(value)}\n  details: ${safeStringify(details)}` : headline(value);
  }
  return typeof value === "string" ? value : safeStringify(value);
}

/** `err.stack` followed by its causes and aggregated errors. */
function describeErrorChain(err: ErrorLike): string {
  const parts: string[] = [headline(err)];
  const seen = new Set<unknown>([err]);

  const visit = (current: unknown, depth: number): void => {
    if (depth >= MAX_CAUSE_DEPTH || typeof current !== "object" || current === null) {
      return;
    }
    const members: unknown = (current as { errors?: unknown }).errors;
    if (isErrorLike(current) && Array.isArray(members)) {
      members.forEach((member: unknown, index: number) => {
        if (seen.has(member)) return;
        seen.add(member);
        parts.push(`Aggregated error [${index}]: ${describeUnknown(member)}`);
        visit(member, depth + 1);
      });
    }
    if (!("cause" in current)) return;
    const cause: unknown = (current as { cause?: unknown }).cause;
    if (cause === undefined || seen.has(cause)) return;
    seen.add(cause);
    parts.push(`Caused by: ${describeUnknown(cause)}`);
    visit(cause, depth + 1);
  };
  visit(err, 0);

  return parts.join("\n\n");
}

/**
 * The error's own enumerable properties besides name / message / stack,
 * e.g. a Postgres error's `code`, `detail`, `constraint`, `table`.
 */
function errorDetails(err: unknown): Record<string, unknown> | null {
  if (!isErrorLike(err)) return null;
  const details: Record<string, unknown> = {};
  try {
    for (const [key, value] of Object.entries(err)) {
      if (NON_DETAIL_PROPERTIES.has(key) || value === undefined || typeof value === "function") {
        continue;
      }
      details[key] = value;
    }
  } catch {
    // a throwing getter: keep what was read so far
  }
  return Object.keys(details).length > 0 ? details : null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function stripNul(value: string): string {
  return value.includes("\u0000") ? value.replaceAll("\u0000", "�") : value;
}

/**
 * `value` reduced to what JSON can hold: bigints become strings, nested
 * errors `{ name, message, stack }`, cycles and anything nested deeper than
 * {@link MAX_JSON_DEPTH} a placeholder; NUL characters are replaced.
 */
function toJsonValue(value: unknown, ancestors: readonly object[], depth: number): unknown {
  if (typeof value === "string") return stripNul(value);
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number") return Number.isFinite(value) ? value : String(value);
  if (value === null || typeof value === "boolean") return value;
  if (typeof value !== "object") return undefined; // undefined, functions, symbols
  if (ancestors.includes(value)) return "[Circular]";
  if (depth >= MAX_JSON_DEPTH) return "[Truncated]";

  const toJSON: unknown = (value as { toJSON?: unknown }).toJSON;
  if (typeof toJSON === "function") {
    try {
      return toJsonValue(toJSON.call(value), [...ancestors, value], depth + 1);
    } catch {
      return "[Unserializable]";
    }
  }

  const nextAncestors: readonly object[] = [...ancestors, value];
  if (Array.isArray(value)) {
    return value.map((item: unknown) => toJsonValue(item, nextAncestors, depth + 1) ?? null);
  }
  if (value instanceof Map) {
    return toJsonValue(Object.fromEntries(value), nextAncestors, depth + 1);
  }
  if (value instanceof Set) {
    return toJsonValue([...value], nextAncestors, depth + 1);
  }

  const result: Record<string, unknown> = {};
  if (isErrorLike(value)) {
    result.name = stripNul(value.name);
    result.message = stripNul(value.message);
    if (typeof value.stack === "string") result.stack = stripNul(value.stack);
  }
  for (const [key, item] of Object.entries(value)) {
    const converted: unknown = toJsonValue(item, nextAncestors, depth + 1);
    if (converted !== undefined) result[stripNul(key)] = converted;
  }
  return result;
}

/** JSON text for a JSONB column; null when `value` has no JSON form. */
function toJsonText(value: unknown): string | null {
  try {
    const converted: unknown = toJsonValue(value, [], 0);
    return converted === undefined ? null : JSON.stringify(converted);
  } catch {
    return JSON.stringify("[Unserializable]");
  }
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(toJsonValue(value, [], 0)) ?? String(value);
  } catch {
    try {
      return String(value);
    } catch {
      return "[Unserializable]";
    }
  }
}

export default captureServerException;
