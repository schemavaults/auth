// oidc-token-error.ts
//
// Classifies failures thrown by openid-client's grant helpers so the
// SDK can tell "the session is gone" (log the user out) apart from
// transient / configuration errors.

import * as oidc from "openid-client";

export interface ClassifiedOidcTokenError {
  /** RFC 6749 §5.2 error code when the server returned one. */
  error: string | null;
  error_description: string | null;
  status: number | null;
  /**
   * True when the auth server rejected the grant itself (invalid,
   * expired, revoked, or re-used refresh token / authorization code, or
   * the client was rejected outright): the local session cannot be
   * recovered and should be cleared.
   */
  session_lost: boolean;
  message: string;
}

const SESSION_LOST_ERROR_CODES: ReadonlySet<string> = new Set([
  "invalid_grant",
  "invalid_client",
  "unauthorized_client",
]);

export function classifyOidcTokenError(e: unknown): ClassifiedOidcTokenError {
  if (e instanceof oidc.ResponseBodyError) {
    const error: string = e.error;
    const error_description: string | null = e.error_description ?? null;
    const status: number = e.status;
    const session_lost: boolean =
      SESSION_LOST_ERROR_CODES.has(error) || status === 401 || status === 403;
    return {
      error,
      error_description,
      status,
      session_lost,
      message: `${error}${error_description ? `: ${error_description}` : ""} (HTTP ${status})`,
    };
  }
  if (e instanceof oidc.WWWAuthenticateChallengeError) {
    const status: number = e.status;
    return {
      error: null,
      error_description: null,
      status,
      session_lost: status === 401 || status === 403,
      message: `${e.message} (HTTP ${status})`,
    };
  }
  if (e instanceof oidc.ResponseBodyError || e instanceof Error) {
    return {
      error: null,
      error_description: null,
      status: null,
      session_lost: false,
      message: e.message,
    };
  }
  return {
    error: null,
    error_description: null,
    status: null,
    session_lost: false,
    message: "Unknown token endpoint error",
  };
}

export default classifyOidcTokenError;
