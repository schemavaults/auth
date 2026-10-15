// JwtKeyManagerMisconfigurationError.ts

/**
 * Why the keys that verify this server's tokens cannot be loaded:
 *
 * - `jwks_download_refused`: the auth server refused the JWKS download (a
 *   4xx answer: the JWKS access key is not the API server's active one, or
 *   the API server id / auth server URL is wrong).
 * - `jwks_access_private_key_unusable`: the JWKS access private key is
 *   missing, cannot be parsed, or cannot sign the JWKS access assertion.
 */
export type JwtKeyManagerMisconfigurationReason =
  | "jwks_download_refused"
  | "jwks_access_private_key_unusable";

/**
 * @description Thrown by a JWT key manager when the server's configuration
 * keeps it from loading the keys that verify tokens. No token verifies until
 * the configuration is fixed, so route guards report a server
 * misconfiguration instead of an unauthenticated request: sending the user
 * back to sign in would only mint another token that cannot be verified
 * either.
 */
export class JwtKeyManagerMisconfigurationError extends Error {
  public override name: string = "JwtKeyManagerMisconfigurationError";
  public readonly reason: JwtKeyManagerMisconfigurationReason;
  /** HTTP status of the refused JWKS download (`jwks_download_refused`). */
  public readonly status: number | undefined;

  public constructor(
    reason: JwtKeyManagerMisconfigurationReason,
    message: string,
    options: { cause?: unknown; status?: number } = {},
  ) {
    super(
      message,
      options.cause === undefined ? undefined : { cause: options.cause },
    );
    this.reason = reason;
    this.status = options.status;
  }
}

export default JwtKeyManagerMisconfigurationError;
