// NOT server-only: plain constants, shared by the token endpoint's operation
// (OpenAPI document), the grant-type policy and unit tests.

/** RFC 8693 §2.1 `grant_type` of a token exchange request. */
export const TOKEN_EXCHANGE_GRANT_TYPE =
  "urn:ietf:params:oauth:grant-type:token-exchange" as const;

/**
 * RFC 8693 §3 token type identifier of an OAuth 2.0 access token: the only
 * `subject_token_type` this server exchanges and the only token type it
 * issues (`requested_token_type`, `issued_token_type`).
 */
export const ACCESS_TOKEN_TYPE = "urn:ietf:params:oauth:token-type:access_token" as const;

/**
 * The value recorded as `ISSUED_TOKENS.grant_type` for tokens minted by a
 * token exchange (the grant type URN is too long to be a useful label).
 */
export const TOKEN_EXCHANGE_ISSUED_TOKEN_GRANT_TYPE = "token_exchange" as const;
