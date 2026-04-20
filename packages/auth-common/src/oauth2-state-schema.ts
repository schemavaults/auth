import { z } from "zod";

// RFC 6749 §10.12 introduces the OAuth2 `state` parameter as a
// client-side CSRF nonce. RFC 6749 §A.5 defines its on-the-wire form
// as `*VSCHAR` — zero or more printable ASCII characters %x20-%x7E.
// The auth server never interprets `state`; it only echoes the value
// untouched on the callback. The validator below therefore captures
// only the properties worth enforcing at the protocol boundary:
//
//   1. Non-empty (a zero-length state has no CSRF value).
//   2. Bounded length — 512 chars is comfortably above common shapes
//      (UUID, base64url 32-byte nonce, short signed JWTs) while
//      protecting log pipelines and callback-URL buffers from
//      unbounded echo.
//   3. Printable ASCII only — prevents log-pollution / terminal-escape
//      smuggling via control chars, NULs, and CR/LF.
//
// This schema is deliberately not base64url-specific: that would be
// SDK-opinionated and would break RFC-legal third-party clients that
// use UUIDs, signed JWTs, or other formats for their state value.

const MAX_OAUTH2_STATE_LENGTH = 512 as const;

export const OAUTH2_STATE_VSCHAR_REGEX: RegExp = /^[\x20-\x7E]+$/;

export const oauth2StateSchema = z
  .string()
  .min(1)
  .max(MAX_OAUTH2_STATE_LENGTH)
  .regex(OAUTH2_STATE_VSCHAR_REGEX, {
    message:
      "OAuth2 'state' must contain only printable ASCII (RFC 6749 §A.5 VSCHAR)",
  });

export type OAuth2State = z.infer<typeof oauth2StateSchema>;

/**
 * Thrown by `parseOAuth2State` when the caller supplied a `state`
 * value that is present but fails schema validation. Callers at
 * server-side entry points should turn this into a 400 response
 * (e.g. `redirectWithError(400, "bad_request")` for page routes,
 * `NextResponse.json(..., { status: 400 })` for API routes).
 */
export class OAuth2StateValidationError extends Error {
  public readonly reasons: readonly string[];
  public constructor(reasons: readonly string[]) {
    super(`Invalid OAuth2 'state' parameter: ${reasons.join("; ")}`);
    this.name = "OAuth2StateValidationError";
    this.reasons = reasons;
  }
}

/**
 * Validates an OAuth2 `state` at a server boundary.
 *
 *   - Absent / null / undefined → returns `null` (RFC-legal; `state`
 *     is optional).
 *   - Present + well-formed → returns the validated string.
 *   - Present + malformed (wrong type, empty, too long, non-VSCHAR)
 *     → throws `OAuth2StateValidationError` so the caller can 400.
 *
 * Empty strings are treated as malformed (not absent) so a client
 * that accidentally serializes `?state=` gets a loud signal instead
 * of a silent downgrade.
 */
export function parseOAuth2State(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "string") {
    throw new OAuth2StateValidationError([
      `Expected string, got ${Array.isArray(raw) ? "array" : typeof raw}`,
    ]);
  }
  const parsed = oauth2StateSchema.safeParse(raw);
  if (!parsed.success) {
    throw new OAuth2StateValidationError(
      parsed.error.issues.map((i) => i.message),
    );
  }
  return parsed.data;
}
