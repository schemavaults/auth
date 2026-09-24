/**
 * Wire format for every error produced by the operations runtime. Matches
 * the `{ success: false, message }` envelope used throughout the auth
 * server, with a machine readable `error` code in addition.
 */
export interface OperationErrorBody {
  readonly success: false;
  readonly error: string;
  readonly message: string;
  readonly issues?: readonly OperationValidationIssue[];
  /** Extra machine readable details (e.g. missing scopes). */
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface OperationValidationIssue {
  /** Which part of the request failed. */
  readonly location: "params" | "query" | "headers" | "body";
  readonly path: string;
  readonly message: string;
  readonly code: string;
}

export const OPERATION_ERROR_CODES = {
  validation: "validation_error",
  unauthorized: "unauthorized",
  forbidden: "forbidden",
  insufficientScope: "insufficient_scope",
  organizationRequired: "organization_required",
  notMember: "not_an_organization_member",
  unsupportedMediaType: "unsupported_media_type",
  internal: "internal_server_error",
} as const;

/**
 * Throw from a handler (or an auth resolver) to short-circuit with a
 * specific status and error body.
 */
export class OperationError extends Error {
  readonly status: number;
  readonly body: OperationErrorBody;
  readonly headers: Readonly<Record<string, string>>;

  constructor(
    status: number,
    body: Omit<OperationErrorBody, "success">,
    headers: Readonly<Record<string, string>> = {},
  ) {
    super(body.message);
    this.name = "OperationError";
    this.status = status;
    this.body = { success: false, ...body };
    this.headers = headers;
  }

  toResponse(): Response {
    return jsonResponse(this.status, this.body, this.headers);
  }
}

/**
 * Whether `error` is an {@link OperationError}: an instance of this
 * package's class, or a structurally identical one from another copy of
 * the package (isolated installs can load it twice), so a resolver or
 * handler throwing from a different copy still short-circuits as intended.
 */
export function isOperationError(error: unknown): error is OperationError {
  if (error instanceof OperationError) return true;
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as Partial<OperationError> & { name?: unknown };
  return (
    candidate.name === "OperationError" &&
    typeof candidate.status === "number" &&
    typeof candidate.body === "object" &&
    candidate.body !== null &&
    candidate.body.success === false &&
    typeof candidate.toResponse === "function"
  );
}

export function jsonResponse(
  status: number,
  body: unknown,
  headers?: HeadersInit,
): Response {
  const merged = new Headers(headers);
  if (!merged.has("content-type")) {
    merged.set("content-type", "application/json; charset=utf-8");
  }
  return new Response(JSON.stringify(body), { status, headers: merged });
}
