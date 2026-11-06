// OAuth 2.0 Token Exchange (RFC 8693) identifiers, shared by the auth server's
// token endpoint, its discovery document and the SDK helpers that call the
// grant (`exchangeTokenForDelegatedToken()` in @schemavaults/auth-server-sdk).
//
// The auth server uses the grant to mint DELEGATED access tokens: a
// confidential client swaps an access token one of its users holds for an
// API server for one on which the client's service account acts for that
// user (the token's `act` claim), e.g. for an agent the client runs in a
// sandbox.

/** RFC 8693 §2.1 `grant_type` of a token exchange request. */
export const OAUTH_TOKEN_EXCHANGE_GRANT_TYPE =
  "urn:ietf:params:oauth:grant-type:token-exchange" as const;

/**
 * RFC 8693 §3 token type identifier of an OAuth 2.0 access token: the only
 * `subject_token_type` the auth server exchanges and the only token type it
 * issues (`requested_token_type`, `issued_token_type`).
 */
export const OAUTH_ACCESS_TOKEN_TYPE =
  "urn:ietf:params:oauth:token-type:access_token" as const;
