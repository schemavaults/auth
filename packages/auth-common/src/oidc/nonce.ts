import { z } from "zod";

// OIDC Core §3.1.2.1 defines `nonce` as an opaque, case-sensitive string
// the RP binds to its session and verifies when it appears in the
// id_token. Like the OAuth2 `state` parameter (oauth2-state-schema.ts),
// the auth server never interprets the value — it only stores it on the
// authorization-code row and echoes it as an id_token claim — so the
// validator enforces the same protocol-boundary properties: non-empty,
// bounded length, printable ASCII only (no control chars / CR-LF that
// could pollute logs or smuggle terminal escapes through the echo).

const MAX_OIDC_NONCE_LENGTH = 512 as const;

export const OIDC_NONCE_VSCHAR_REGEX: RegExp = /^[\x20-\x7E]+$/;

export const oidcNonceSchema = z
  .string()
  .min(1)
  .max(MAX_OIDC_NONCE_LENGTH)
  .regex(OIDC_NONCE_VSCHAR_REGEX, {
    message: "OIDC 'nonce' must contain only printable ASCII characters",
  });

export type OidcNonce = z.infer<typeof oidcNonceSchema>;

/**
 * Thrown by `parseOidcNonce` when the caller supplied a `nonce` value
 * that is present but fails schema validation. Server-side entry points
 * should turn this into a 400 / `invalid_request` response.
 */
export class OidcNonceValidationError extends Error {
  public readonly reasons: readonly string[];
  public constructor(reasons: readonly string[]) {
    super(`Invalid OIDC 'nonce' parameter: ${reasons.join("; ")}`);
    this.name = "OidcNonceValidationError";
    this.reasons = reasons;
  }
}

/**
 * Validates an OIDC `nonce` at a server boundary.
 *
 *   - Absent / null / undefined → returns `null` (nonce is optional in
 *     the authorization-code flow).
 *   - Present + well-formed → returns the validated string.
 *   - Present + malformed → throws `OidcNonceValidationError` so the
 *     caller can respond 400 / `invalid_request`.
 *
 * Empty strings are treated as malformed (not absent) so an RP that
 * accidentally serializes `?nonce=` gets a loud signal instead of a
 * silent downgrade.
 */
export function parseOidcNonce(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "string") {
    throw new OidcNonceValidationError([
      `Expected string, got ${Array.isArray(raw) ? "array" : typeof raw}`,
    ]);
  }
  const parsed = oidcNonceSchema.safeParse(raw);
  if (!parsed.success) {
    throw new OidcNonceValidationError(
      parsed.error.issues.map((i) => i.message),
    );
  }
  return parsed.data;
}

/**
 * Prefix marking a nonce that was SYNTHESIZED by the auth platform
 * itself (AuthForm / consent screen / already-authenticated page)
 * because the flow's entry URL carried none — e.g. an OIDC relying
 * party that legitimately omitted the optional `nonce` parameter, or a
 * pre-upgrade SDK client. Synthesized nonces exist only to satisfy the
 * login/register endpoints' hard `nonce` requirement uniformly.
 *
 * They are NEVER echoed into id_tokens: strict OIDC RP libraries
 * (e.g. openid-client) reject an id_token that carries a `nonce` claim
 * when the authorization request sent none.
 */
export const SYNTHESIZED_NONCE_PREFIX = "svsynth." as const;

export function isSynthesizedNonce(nonce: string): boolean {
  return (
    typeof nonce === "string" && nonce.startsWith(SYNTHESIZED_NONCE_PREFIX)
  );
}
