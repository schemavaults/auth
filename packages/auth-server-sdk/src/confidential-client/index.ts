/**
 * Calls a confidential client application's backend makes to the auth
 * server with its client secret: minting delegated tokens for the agents it
 * runs for its users (RFC 8693 token exchange) and revoking tokens issued to
 * it (RFC 7009). Server-side only: never ship the client secret to a browser
 * or into an agent's sandbox.
 */

export {
  exchangeTokenForDelegatedToken,
  delegatedTokenResponseSchema,
} from "./exchange-token-for-delegated-token";
export type {
  DelegatedTokenResponse,
  IExchangeTokenForDelegatedTokenOptions,
} from "./exchange-token-for-delegated-token";

export { revokeToken } from "./revoke-token";
export type { IRevokeTokenOptions } from "./revoke-token";

export { OAuthEndpointError, clientSecretBasicAuthorization } from "./shared";
export type { ConfidentialClientCredentials } from "./shared";
