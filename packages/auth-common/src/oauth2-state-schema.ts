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
 * Treats malformed `state` as absent so a buggy or hostile client
 * cannot force the auth server to round-trip a garbage value through
 * its logs and callback URLs. Returns null in any rejection case;
 * emits a warning so integrators can debug legitimate client bugs.
 */
export function parseOAuth2StateOrNull(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const parsed = oauth2StateSchema.safeParse(raw);
  if (!parsed.success) {
    console.warn(
      "[oauth2StateSchema] Dropping invalid OAuth2 state (length=%d, errors=%o)",
      raw.length,
      parsed.error.issues.map((i) => i.message),
    );
    return null;
  }
  return parsed.data;
}
