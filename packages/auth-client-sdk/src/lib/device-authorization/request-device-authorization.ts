// request-device-authorization.ts
//
// The first leg of the OAuth 2.0 Device Authorization Grant (RFC 8628
// §3.1): asks the auth server's device authorization endpoint for a device
// code and a user code, through `openid-client` (the endpoint comes from the
// shared provider metadata, like every other OIDC endpoint the SDK calls).

import * as oidc from "openid-client";
import type { AppId, SchemaVaultsAppEnvironment } from "@schemavaults/app-definitions";
import {
  OIDC_TOKEN_RESOURCE_PARAM,
  deviceAuthorizationResponseSchema,
  formatScope,
  type DeviceAuthorizationResponse,
  type ScopeInput,
} from "@schemavaults/auth-common";
import type { ISchemaVaultsAuthClientAdapter } from "@/types/ISchemaVaultsAuthClientAdapter";
import {
  classifyOidcTokenError,
  createOidcClientConfiguration,
  TokenEndpointRequestFailedError,
} from "@/lib/oidc";

/** What a device authorization request asks for. */
export interface DeviceAuthorizationRequestOptions {
  /**
   * The scope to ask for: space-delimited, or a list of scope values and
   * definitions (`[oidcScopes.openid, notesScopes.read]`). Include `openid`
   * to receive an id_token (`signInWithDeviceAuthorization()` requires it).
   */
  scope: ScopeInput;
  /**
   * RFC 8707 resource indicator naming the API server whose API scopes
   * `scope` asks for (an API server id or the URL of one of its domains).
   */
  resource?: string;
}

export interface IRequestDeviceAuthorizationOpts extends DeviceAuthorizationRequestOptions {
  auth_server_url: string;
  client_app_id: AppId;
  environment: SchemaVaultsAppEnvironment;
  adapter: ISchemaVaultsAuthClientAdapter;
}

/** The form parameters of a device authorization request. */
export function buildDeviceAuthorizationRequestParameters({
  scope,
  resource,
}: DeviceAuthorizationRequestOptions): URLSearchParams {
  const parameters = new URLSearchParams();
  const serialized_scope: string = formatScope(scope);
  if (serialized_scope.length > 0) {
    parameters.set("scope", serialized_scope);
  }
  if (resource !== undefined) {
    if (typeof resource !== "string" || resource.length === 0) {
      throw new TypeError("Expected 'resource' to be a non-empty string when set!");
    }
    parameters.set(OIDC_TOKEN_RESOURCE_PARAM, resource);
  }
  return parameters;
}

/**
 * Starts a device authorization (RFC 8628 §3.1-3.2) for this client app.
 * Show the user `user_code` and `verification_uri` (or a link / QR code of
 * `verification_uri_complete`), then poll with `pollDeviceAuthorization()`.
 *
 * The app's managers must have enabled the device authorization grant on
 * the auth server, else the request fails with `unauthorized_client`.
 *
 * @throws {TokenEndpointRequestFailedError} when the auth server refuses the
 * request (`error` is the RFC 6749 §5.2 code, e.g. `unauthorized_client`,
 * `invalid_scope`, `invalid_target`).
 */
export async function requestDeviceAuthorization({
  auth_server_url,
  client_app_id,
  environment,
  adapter,
  scope,
  resource,
}: IRequestDeviceAuthorizationOpts): Promise<DeviceAuthorizationResponse> {
  const config: oidc.Configuration = createOidcClientConfiguration({
    auth_server_url,
    client_app_id,
    environment,
    adapter,
  });
  let response: oidc.DeviceAuthorizationResponse;
  try {
    response = await oidc.initiateDeviceAuthorization(
      config,
      buildDeviceAuthorizationRequestParameters({ scope, resource }),
    );
  } catch (e: unknown) {
    const classified = classifyOidcTokenError(e);
    throw new TokenEndpointRequestFailedError(
      `Device authorization request failed: ${classified.message}`,
      classified,
      { cause: e },
    );
  }
  return deviceAuthorizationResponseSchema.parse(response);
}

export default requestDeviceAuthorization;
