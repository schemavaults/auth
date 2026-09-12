import type { ZodObject, ZodType } from "zod";
import type { Context } from "hono";
import type { AnyOperationDefinition, RequestBodyDefinition } from "../operation";
import {
  OPERATION_ERROR_CODES,
  OperationError,
  type OperationValidationIssue,
} from "./errors";

async function parseWith(
  schema: ZodType,
  value: unknown,
  location: OperationValidationIssue["location"],
): Promise<unknown> {
  const result = await schema.safeParseAsync(value);
  if (result.success) return result.data;
  const issues: OperationValidationIssue[] = result.error.issues.map((issue) => ({
    location,
    path: issue.path.map((segment) => String(segment)).join("."),
    message: issue.message,
    code: issue.code,
  }));
  throw new OperationError(400, {
    error: OPERATION_ERROR_CODES.validation,
    message: `Invalid request ${location}`,
    issues,
  });
}

/** Query string as an object: single values as strings, repeated keys as arrays. */
export function queryToObject(c: Context): Record<string, string | string[]> {
  const result: Record<string, string | string[]> = {};
  for (const [key, values] of Object.entries(c.req.queries())) {
    if (values.length === 1) {
      const [single] = values;
      if (typeof single === "string") result[key] = single;
    } else if (values.length > 1) {
      result[key] = values;
    }
  }
  return result;
}

export function headersToObject(c: Context): Record<string, string> {
  const result: Record<string, string> = {};
  c.req.raw.headers.forEach((value, key) => {
    result[key.toLowerCase()] = value;
  });
  return result;
}

function mediaTypeOf(c: Context): string | null {
  const header = c.req.header("content-type");
  if (typeof header !== "string") return null;
  const [type] = header.split(";");
  return type?.trim().toLowerCase() ?? null;
}

export async function readRequestBody(
  c: Context,
  definition: RequestBodyDefinition,
): Promise<unknown> {
  const expected = (definition.contentType ?? "application/json").toLowerCase();
  const required = definition.required ?? true;
  const actual = mediaTypeOf(c);
  const contentLength = c.req.header("content-length");
  const looksEmpty =
    actual === null && (contentLength === undefined || contentLength === "0");

  if (looksEmpty) {
    if (!required) return undefined;
    throw new OperationError(400, {
      error: OPERATION_ERROR_CODES.validation,
      message: `A ${expected} request body is required`,
      issues: [
        { location: "body", path: "", message: "Request body is required", code: "required" },
      ],
    });
  }

  if (actual !== expected && !(expected === "text/plain" && actual?.startsWith("text/"))) {
    throw new OperationError(415, {
      error: OPERATION_ERROR_CODES.unsupportedMediaType,
      message: `Expected a ${expected} request body but received ${actual ?? "none"}`,
    });
  }

  try {
    switch (expected) {
      case "application/json":
        return await c.req.json();
      case "application/x-www-form-urlencoded":
      case "multipart/form-data":
        return await c.req.parseBody({ all: true });
      case "text/plain":
        return await c.req.text();
      default:
        if (expected.endsWith("+json")) return await c.req.json();
        return await c.req.text();
    }
  } catch (e: unknown) {
    throw new OperationError(400, {
      error: OPERATION_ERROR_CODES.validation,
      message: `Malformed ${expected} request body`,
      issues: [
        {
          location: "body",
          path: "",
          message: e instanceof Error ? e.message : "Could not parse body",
          code: "malformed",
        },
      ],
    });
  }
}

export interface ValidatedRequest {
  readonly params: Readonly<Record<string, unknown>>;
  readonly query: Readonly<Record<string, unknown>>;
  readonly headers: Readonly<Record<string, unknown>>;
  readonly body: unknown;
}

const EMPTY: Readonly<Record<string, never>> = Object.freeze({});

export async function validateRequest(
  c: Context,
  operation: AnyOperationDefinition,
): Promise<ValidatedRequest> {
  const { params, query, headers, body } = operation.request;
  const parsedParams = params
    ? ((await parseWith(params as ZodObject, c.req.param(), "params")) as Record<string, unknown>)
    : EMPTY;
  const parsedQuery = query
    ? ((await parseWith(query as ZodObject, queryToObject(c), "query")) as Record<string, unknown>)
    : EMPTY;
  const parsedHeaders = headers
    ? ((await parseWith(headers as ZodObject, headersToObject(c), "headers")) as Record<string, unknown>)
    : EMPTY;
  let parsedBody: unknown = undefined;
  if (body) {
    const raw = await readRequestBody(c, body);
    if (raw !== undefined || (body.required ?? true)) {
      parsedBody = await parseWith(body.schema, raw, "body");
    }
  }
  return { params: parsedParams, query: parsedQuery, headers: parsedHeaders, body: parsedBody };
}
