// NOT server-only: plain constants, shared by the token endpoint's operation
// (OpenAPI document), the grant-type policy and unit tests.

/**
 * RFC 8693 §2.1 `grant_type` of a token exchange request, and RFC 8693 §3
 * token type identifier of an OAuth 2.0 access token: the only
 * `subject_token_type` this server exchanges and the only token type it
 * issues (`requested_token_type`, `issued_token_type`). Defined in
 * @schemavaults/auth-common so the discovery document and the SDK helpers
 * use the same values.
 */
export {
  OAUTH_TOKEN_EXCHANGE_GRANT_TYPE as TOKEN_EXCHANGE_GRANT_TYPE,
  OAUTH_ACCESS_TOKEN_TYPE as ACCESS_TOKEN_TYPE,
} from "@schemavaults/auth-common";

/**
 * The value recorded as `ISSUED_TOKENS.grant_type` for tokens minted by a
 * token exchange (the grant type URN is too long to be a useful label).
 */
export const TOKEN_EXCHANGE_ISSUED_TOKEN_GRANT_TYPE = "token_exchange" as const;
