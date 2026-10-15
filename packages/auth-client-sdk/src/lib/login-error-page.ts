import type { SchemaVaultsAuthErrorId } from "@schemavaults/auth-common";
import { TokenEndpointRequestFailedError } from "./oidc";

/** Where to send a user whose sign-in to a client app failed. */
export interface LoginErrorPageTarget {
  error_id: SchemaVaultsAuthErrorId;
  /** HTTP-style status shown on the error page (4xx-5xx). */
  error_code: number;
}

/** How many `cause` links are inspected. */
const MAX_CAUSE_DEPTH: number = 5;

/**
 * Whether `error` is a {@link TokenEndpointRequestFailedError}, including
 * one thrown by another copy of the SDK (matched by name).
 */
export function isTokenEndpointRequestFailedError(
  error: unknown,
): error is TokenEndpointRequestFailedError {
  return (
    error instanceof TokenEndpointRequestFailedError ||
    (error instanceof Error &&
      error.name === "TokenEndpointRequestFailedError" &&
      "oauth_error" in error)
  );
}

function findTokenEndpointRequestFailure(
  error: unknown,
): TokenEndpointRequestFailedError | null {
  let current: unknown = error;
  for (
    let depth = 0;
    depth <= MAX_CAUSE_DEPTH && current instanceof Error;
    depth++
  ) {
    if (isTokenEndpointRequestFailedError(current)) {
      return current;
    }
    current = current.cause;
  }
  return null;
}

/**
 * Picks the error page entry for a failure to sign a user in to a client
 * app: redeeming the authorization code on the app's authorize page, or
 * acquiring the app's default access tokens. Apps send the user to the
 * error page rather than back into the login flow, which would fail the
 * same way again and, while the auth server's session cookie is valid,
 * bounce between the login and authorize pages forever.
 *
 * Looks through `error`'s `cause` chain for the token endpoint's answer.
 */
export function resolveLoginErrorPage(error: unknown): LoginErrorPageTarget {
  const failure: TokenEndpointRequestFailedError | null =
    findTokenEndpointRequestFailure(error);

  if (failure?.oauth_error === "invalid_target") {
    // RFC 8707: the auth server refused the requested audience, i.e. the
    // client app is not connected to that API server (or the audience
    // names no registered API server).
    return { error_id: "app_not_connected_to_api_server", error_code: 403 };
  }

  const status: number | null = failure?.status ?? null;
  return {
    error_id: "login_failure",
    error_code:
      typeof status === "number" &&
      Number.isInteger(status) &&
      status >= 400 &&
      status < 600
        ? status
        : 500,
  };
}

export default resolveLoginErrorPage;
