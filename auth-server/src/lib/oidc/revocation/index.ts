import "server-only";

/**
 * RFC 7009 token revocation (`POST /api/oidc/revoke`):
 *
 *   - parse-revocation-request.ts: read the token and the client from the
 *     form and the Basic header — nothing verified
 *   - authenticate-revocation-client.ts: the client's credentials, as at the
 *     token endpoint (secret for confidential clients, `client_id` alone for
 *     public ones)
 *   - decode-revocable-token.ts: verify the token and that it was issued to
 *     the client (the introspection rules for a client-app caller)
 *   - revoke-decoded-token.ts: revoke it by `jti` (a refresh token with the
 *     access tokens minted alongside it)
 */

export { parseRevocationRequest } from "./parse-revocation-request";
export { authenticateRevocationClient } from "./authenticate-revocation-client";
export type {
  AuthenticateRevocationClientOptions,
  AuthenticateRevocationClientResult,
} from "./authenticate-revocation-client";
export { decodeRevocableToken } from "./decode-revocable-token";
export type { DecodeRevocableTokenOptions } from "./decode-revocable-token";
export { revokeDecodedToken } from "./revoke-decoded-token";
export type { RevokedTokens } from "./revoke-decoded-token";
export type {
  ParsedRevocationRequest,
  ParseRevocationRequestResult,
  RevocableToken,
  RevocationRequestError,
  VerifiedRevocableToken,
} from "./types";
