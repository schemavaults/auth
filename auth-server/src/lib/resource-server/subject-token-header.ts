import "server-only";
import { MaximumBrowserCookieSize } from "@schemavaults/auth-common";
import { encrypt_decrypt_alg } from "@schemavaults/jwt";

/**
 * Upper bound on an `X-Subject-Token` value: the platform's access tokens
 * live in cookies (`access_token_<api_server_id>`), which browsers cap at
 * 4 KiB, so no genuine token is longer.
 */
export const MAX_SUBJECT_TOKEN_LENGTH: number = MaximumBrowserCookieSize;

/** One base64url segment of a compact serialization (RFC 7515 §2 / RFC 7516 §7.1). */
const BASE64URL_SEGMENT = /^[A-Za-z0-9_-]+$/;

/**
 * The platform's access tokens are JWEs in compact serialization:
 * `header.encrypted_key.iv.ciphertext.tag`. With RSA-OAEP-256 key
 * management none of the five segments is empty.
 */
const JWE_COMPACT_SEGMENT_COUNT = 5;

export type ParsedSubjectTokenHeader =
  /** No `X-Subject-Token` header was sent. */
  | { kind: "absent" }
  /** A header was sent but cannot be one of the platform's access tokens. */
  | { kind: "malformed"; reason: string }
  /** A well-formed token, still to be verified (`verifyResourceServerSubjectToken`). */
  | { kind: "token"; token: string };

function malformed(reason: string): ParsedSubjectTokenHeader {
  return { kind: "malformed", reason };
}

/**
 * @description Parses the `X-Subject-Token` header of a resource-server
 * request before anything is looked up with it. Accepts only what can be
 * one of the platform's access tokens: a JWE in compact serialization of
 * at most {@link MAX_SUBJECT_TOKEN_LENGTH} characters whose protected
 * header is a JSON object naming the platform's key management algorithm
 * and carrying the `enc`, `keyset_id` and `aud` members the verifier
 * reads before decrypting. The value is not trimmed or otherwise
 * normalized.
 *
 * This is a shape check only: whether the token is genuine, active and
 * issued to the user for the calling API server is decided by
 * `verifyResourceServerSubjectToken()`.
 */
export function parseSubjectTokenHeader(
  value: string | null | undefined,
): ParsedSubjectTokenHeader {
  if (value === undefined || value === null) {
    return { kind: "absent" };
  }
  if (value.length === 0) {
    return malformed("X-Subject-Token is empty");
  }
  if (value.length > MAX_SUBJECT_TOKEN_LENGTH) {
    return malformed(
      `X-Subject-Token is longer than ${MAX_SUBJECT_TOKEN_LENGTH} characters`,
    );
  }

  const segments: string[] = value.split(".");
  if (
    segments.length !== JWE_COMPACT_SEGMENT_COUNT ||
    !segments.every((segment) => BASE64URL_SEGMENT.test(segment))
  ) {
    return malformed(
      "X-Subject-Token must be a JWE in compact serialization (five base64url segments)",
    );
  }

  let header: unknown;
  try {
    header = JSON.parse(
      Buffer.from(segments[0] as string, "base64url").toString("utf8"),
    );
  } catch {
    return malformed(
      "X-Subject-Token's protected header is not base64url-encoded JSON",
    );
  }
  if (typeof header !== "object" || header === null || Array.isArray(header)) {
    return malformed("X-Subject-Token's protected header is not a JSON object");
  }

  const { alg, enc, keyset_id, aud } = header as Record<string, unknown>;
  if (alg !== encrypt_decrypt_alg) {
    return malformed(
      `X-Subject-Token's protected header must name the '${encrypt_decrypt_alg}' algorithm`,
    );
  }
  for (const [name, member] of [
    ["enc", enc],
    ["keyset_id", keyset_id],
    ["aud", aud],
  ] as const) {
    if (typeof member !== "string" || member.length === 0) {
      return malformed(
        `X-Subject-Token's protected header is missing '${name}'`,
      );
    }
  }

  return { kind: "token", token: value };
}

export default parseSubjectTokenHeader;
