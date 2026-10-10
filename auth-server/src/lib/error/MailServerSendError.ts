/**
 * The mail server's `{ success: false, error, message }` error envelope
 * (`OperationErrorBodySchema` in `@schemavaults/openapi-operations`), as far
 * as a failed `/api/send` response body could be read.
 */
export interface MailServerErrorEnvelope {
  /** Machine readable error code, e.g. `token_revoked`, `validation_error`. */
  code: string | null;
  /** Human readable explanation. */
  message: string | null;
}

/** Reads the error envelope out of a parsed response body, tolerating anything else. */
export function parseMailServerErrorEnvelope(body: unknown): MailServerErrorEnvelope {
  if (typeof body !== "object" || body === null) {
    return { code: null, message: null };
  }
  const record = body as Record<string, unknown>;
  const code: unknown = record.error;
  const message: unknown = record.message;
  return {
    code: typeof code === "string" && code.length > 0 ? code : null,
    message: typeof message === "string" && message.length > 0 ? message : null,
  };
}

export interface MailServerSendFailure {
  /** The `/api/send` URL the request was sent to. */
  endpoint: string;
  status: number;
  statusText: string;
  envelope: MailServerErrorEnvelope;
}

/**
 * `Failed to send email via mail server /api/send endpoint: 401 Unauthorized
 * (token_revoked: ...)`. The prefix is the message callers have always
 * captured; the parenthesised part is what the mail server said, which is
 * what distinguishes a revoked token from a scope refusal or an outage.
 */
export function describeMailServerSendFailure({
  status,
  statusText,
  envelope,
}: Pick<MailServerSendFailure, "status" | "statusText" | "envelope">): string {
  const detail: string | null =
    envelope.code && envelope.message
      ? `${envelope.code}: ${envelope.message}`
      : (envelope.code ?? envelope.message);
  return (
    `Failed to send email via mail server /api/send endpoint: ${status} ${statusText}`.trimEnd() +
    (detail ? ` (${detail})` : "")
  );
}

/**
 * A `/api/send` request the mail server answered with a non-2xx status.
 * Carries the status and the mail server's error code so the ERRORS table
 * row and the server log say *why* the email was refused.
 */
export class MailServerSendError extends Error {
  readonly endpoint: string;
  readonly status: number;
  readonly statusText: string;
  /** The mail server's machine readable error code, when its body carried one. */
  readonly code: string | null;
  /** The mail server's explanation, when its body carried one. */
  readonly mailServerMessage: string | null;

  constructor(failure: MailServerSendFailure) {
    super(describeMailServerSendFailure(failure));
    this.name = "MailServerSendError";
    this.endpoint = failure.endpoint;
    this.status = failure.status;
    this.statusText = failure.statusText;
    this.code = failure.envelope.code;
    this.mailServerMessage = failure.envelope.message;
  }
}

export default MailServerSendError;
