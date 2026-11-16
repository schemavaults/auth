/**
 * Calls a confidential client application's backend makes to the auth
 * server with its client secret: minting delegated tokens for the agents it
 * runs for its users (RFC 8693 token exchange), signing users in on devices
 * it drives (RFC 8628 device authorization grant) and revoking tokens issued
 * to it (RFC 7009). Server-side only: never ship the client secret to a
 * browser or into an agent's sandbox.
 */

export {
  exchangeTokenForDelegatedToken,
  delegatedTokenResponseSchema,
} from "./exchange-token-for-delegated-token";
export type {
  DelegatedTokenResponse,
  IExchangeTokenForDelegatedTokenOptions,
} from "./exchange-token-for-delegated-token";

export { startDeviceAuthorization } from "./start-device-authorization";
export type { IStartDeviceAuthorizationOptions } from "./start-device-authorization";

export {
  pollDeviceAuthorization,
  requestDeviceAccessToken,
  deviceAccessTokenResponseSchema,
} from "./poll-device-authorization";
export type {
  DeviceAccessTokenPollResult,
  DeviceAccessTokenResponse,
  IPollDeviceAuthorizationOptions,
  IRequestDeviceAccessTokenOptions,
} from "./poll-device-authorization";
export type { DeviceAuthorizationResponse } from "@schemavaults/auth-common";

export { revokeToken } from "./revoke-token";
export type { IRevokeTokenOptions } from "./revoke-token";

export { OAuthEndpointError, clientSecretBasicAuthorization } from "./shared";
export type { ConfidentialClientCredentials } from "./shared";
