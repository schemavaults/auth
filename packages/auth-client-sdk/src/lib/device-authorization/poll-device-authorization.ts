// poll-device-authorization.ts
//
// The second leg of the Device Authorization Grant (RFC 8628 §3.4-3.5):
// polls the token endpoint with the device code until the user approves or
// denies the request, or it expires. `openid-client` paces the polls: it
// waits `interval` seconds between them and 5 more after every `slow_down`.

import * as oidc from "openid-client";
import type { AppId, SchemaVaultsAppEnvironment } from "@schemavaults/app-definitions";
import {
  OIDC_TOKEN_REFRESH_TOKEN_DELIVERY_PARAM,
  OIDC_TOKEN_RESOURCE_PARAM,
  type DeviceAuthorizationResponse,
} from "@schemavaults/auth-common";
import type { ISchemaVaultsAuthClientAdapter } from "@/types/ISchemaVaultsAuthClientAdapter";
import {
  classifyOidcTokenError,
  createOidcClientConfiguration,
  TokenEndpointRequestFailedError,
} from "@/lib/oidc";

export interface IPollDeviceAuthorizationOpts {
  auth_server_url: string;
  client_app_id: AppId;
  environment: SchemaVaultsAppEnvironment;
  adapter: ISchemaVaultsAuthClientAdapter;
  /** The response of `requestDeviceAuthorization()`. */
  device_authorization: DeviceAuthorizationResponse;
  /**
   * RFC 8707 resource indicator: the API server to mint the access token
   * for (the API scopes the user approved go on it only then). Defaults to
   * the reserved userinfo audience.
   */
  resource?: string;
  /** Ask for the refresh token as an HTTP-only cookie (browser adapters only). */
  refresh_token_as_http_only_cookie?: boolean;
  /**
   * Stops polling. Without one, polling stops when the device code expires
   * (`expires_in`).
   */
  signal?: AbortSignal;
}

/**
 * Polls until the user decides (RFC 8628 §3.4). Resolves with the token
 * response once they approve: an access token, a refresh token, and an
 * id_token when the approved scope includes `openid`.
 *
 * @throws {TokenEndpointRequestFailedError} when the polling ends without
 * tokens: `oauth_error` is `access_denied` (the user denied the request),
 * `expired_token` (the code expired before they approved it; start over), or
 * another RFC 6749 §5.2 code. An aborted `signal` rejects with its reason.
 */
export async function pollDeviceAuthorization({
  auth_server_url,
  client_app_id,
  environment,
  adapter,
  device_authorization,
  resource,
  refresh_token_as_http_only_cookie = false,
  signal,
}: IPollDeviceAuthorizationOpts): Promise<
  oidc.TokenEndpointResponse & oidc.TokenEndpointResponseHelpers
> {
  const config: oidc.Configuration = createOidcClientConfiguration({
    auth_server_url,
    client_app_id,
    environment,
    adapter,
  });
  const parameters = new URLSearchParams();
  if (resource !== undefined) {
    parameters.set(OIDC_TOKEN_RESOURCE_PARAM, resource);
  }
  if (refresh_token_as_http_only_cookie) {
    parameters.set(OIDC_TOKEN_REFRESH_TOKEN_DELIVERY_PARAM, "http_only_cookie");
  }
  try {
    return await oidc.pollDeviceAuthorizationGrant(
      config,
      // Our schema keeps unknown members as `unknown`; openid-client's type
      // wants them JSON-typed. The value is the parsed JSON response either way.
      device_authorization as unknown as oidc.DeviceAuthorizationResponse,
      parameters,
      signal ? { signal } : undefined,
    );
  } catch (e: unknown) {
    if (signal?.aborted) {
      throw signal.reason ?? e;
    }
    // Without a signal, openid-client stops polling with a TimeoutError once
    // `expires_in` has passed: the code expired on our side of the race.
    if (e instanceof Error && e.name === "TimeoutError") {
      throw new TokenEndpointRequestFailedError(
        "Device authorization did not complete: the code expired before the user approved it",
        {
          error: "expired_token",
          error_description: "The device code expired before the user approved it.",
          status: null,
          session_lost: false,
          message: "expired_token",
        },
        { cause: e },
      );
    }
    const classified = classifyOidcTokenError(e);
    throw new TokenEndpointRequestFailedError(
      `Device authorization did not complete: ${classified.message}`,
      classified,
      { cause: e },
    );
  }
}

export default pollDeviceAuthorization;
