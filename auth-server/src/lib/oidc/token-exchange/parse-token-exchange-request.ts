// NOT server-only: a pure function over the form accessor (unit tested
// under `bun test`).

import type { OidcTokenRequestError } from "@/lib/oidc/token-request-extensions/oidc-token-request-error";
import { ACCESS_TOKEN_TYPE } from "./token-exchange-constants";

/**
 * Reads one token request form field; null when absent or empty (the token
 * endpoint's `OidcTokenFormParam`).
 */
export type TokenExchangeFormParam = (name: string) => string | null;

export interface ParsedTokenExchangeRequest {
  /** The user's access token to exchange (RFC 8693 `subject_token`). */
  subject_token: string;
}

export type ParseTokenExchangeRequestResult =
  | { ok: true; request: ParsedTokenExchangeRequest }
  | { ok: false; error: OidcTokenRequestError };

/**
 * Reads the RFC 8693 §2.1 parameters of a token exchange request. `scope`
 * and `resource` are read by the grant handler with the token endpoint's
 * shared parsers.
 *
 * What this server exchanges:
 *  - `subject_token`: REQUIRED, with `subject_token_type`
 *    `urn:ietf:params:oauth:token-type:access_token`. The subject token is
 *    an access token the user holds for the target API server, issued to
 *    the requesting client.
 *  - `requested_token_type`: optional; an access token is all this server
 *    issues.
 *  - `actor_token` / `actor_token_type`: refused. The actor is the
 *    authenticated client's own service account, so there is no separate
 *    actor credential to present.
 *  - `audience`: refused. The target is named with the RFC 8707 `resource`
 *    parameter, as on the other grants.
 */
export function parseTokenExchangeRequest(
  param: TokenExchangeFormParam,
): ParseTokenExchangeRequestResult {
  const fail = (
    error: OidcTokenRequestError["error"],
    error_description: string,
  ): ParseTokenExchangeRequestResult => ({
    ok: false,
    error: { error, error_description },
  });

  const subject_token: string | null = param("subject_token");
  if (subject_token === null) {
    return fail("invalid_request", "Missing 'subject_token' parameter.");
  }
  const subject_token_type: string | null = param("subject_token_type");
  if (subject_token_type === null) {
    return fail("invalid_request", "Missing 'subject_token_type' parameter.");
  }
  if (subject_token_type !== ACCESS_TOKEN_TYPE) {
    return fail(
      "invalid_request",
      `Unsupported 'subject_token_type': only '${ACCESS_TOKEN_TYPE}' can be exchanged.`,
    );
  }

  const requested_token_type: string | null = param("requested_token_type");
  if (requested_token_type !== null && requested_token_type !== ACCESS_TOKEN_TYPE) {
    return fail(
      "invalid_request",
      `Unsupported 'requested_token_type': only '${ACCESS_TOKEN_TYPE}' can be issued.`,
    );
  }

  if (param("actor_token") !== null || param("actor_token_type") !== null) {
    return fail(
      "invalid_request",
      "'actor_token' is not supported: the actor is the authenticated client's service account.",
    );
  }

  if (param("audience") !== null) {
    return fail(
      "invalid_target",
      "'audience' is not supported: name the target API server with the 'resource' parameter.",
    );
  }

  return { ok: true, request: { subject_token } };
}

export default parseTokenExchangeRequest;
