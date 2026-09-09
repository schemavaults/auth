import "server-only";
import type { OidcTokenErrorCode } from "../oidc-errors";

/**
 * An RFC 6749 §5.2 error a token-request extension parser/validator
 * reports back to the token endpoint, which renders it as the JSON error
 * response.
 */
export interface OidcTokenRequestError {
  error: OidcTokenErrorCode;
  error_description: string;
}
