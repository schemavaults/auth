/**
 * The step of a whoami request that failed:
 *
 * - `network`: no (complete) response. Offline, a DNS/TLS failure, or, in
 *   browsers, a CORS refusal: the page cannot tell these apart.
 * - `http_status`: the auth server answered a status other than 2xx, 401
 *   or 403 (401 / 403 mean "not signed in" and resolve to `null`).
 * - `invalid_json`: the response body is empty or not JSON.
 * - `unexpected_response`: the JSON is not a `{ success: true, user }`
 *   envelope.
 * - `invalid_user_data`: `user` failed the SDK's `UserData` schema, usually
 *   because the SDK is older (or newer) than the auth server.
 */
export type WhoamiRequestFailureReason =
  | "network"
  | "http_status"
  | "invalid_json"
  | "unexpected_response"
  | "invalid_user_data";

/**
 * Thrown when the auth server's whoami endpoint
 * (`GET /api/auth/whoami/{client_app_id}`) could not be read. The message
 * says which step failed and why; the underlying error (fetch failure, JSON
 * syntax error, zod error) is kept as `cause`.
 */
export class WhoamiRequestFailedError extends Error {
  public readonly reason: WhoamiRequestFailureReason;
  /** HTTP status of the response, or null when none was received. */
  public readonly status: number | null;

  public constructor(
    reason: WhoamiRequestFailureReason,
    detail: string,
    options: { status?: number | null; cause?: unknown } = {},
  ) {
    super(
      `Failed to load current user data from whoami API: ${detail}`,
      options.cause === undefined ? undefined : { cause: options.cause },
    );
    this.name = "WhoamiRequestFailedError";
    this.reason = reason;
    this.status = options.status ?? null;
  }
}
