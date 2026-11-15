import {
  OIDC_TOKEN_RESOURCE_PARAM,
  deviceAuthorizationResponseSchema,
  formatScope,
  getOidcEndpointUrl,
  type DeviceAuthorizationResponse,
  type ScopeInput,
} from "@schemavaults/auth-common";
import {
  type ConfidentialClientCredentials,
  postAsConfidentialClient,
} from "./shared";

export interface IStartDeviceAuthorizationOptions
  extends ConfidentialClientCredentials {
  /**
   * The scope to ask for: space-delimited, or a list of scope values and
   * definitions (`[oidcScopes.openid, notesScopes.read]`). With `openid` the
   * device's tokens come with an id_token. Omit to ask for none (a plain
   * OAuth 2.0 grant).
   */
  scope?: ScopeInput;
  /**
   * RFC 8707 resource indicator naming the API server whose API scopes
   * `scope` asks for (an API server id or the URL of one of its domains).
   */
  resource?: string;
}

/**
 * Starts an OAuth 2.0 device authorization (RFC 8628 §3.1) as a
 * confidential client, for a device this backend drives (a TV app, a kiosk,
 * an appliance): the auth server answers with a `device_code` for this
 * backend to poll with (`pollDeviceAuthorization()` or
 * `requestDeviceAccessToken()`), and a `user_code` + `verification_uri` to
 * show on the device. The user enters the code on the auth server's
 * `/device` page and approves the request there.
 *
 * The app's managers must have enabled the device authorization grant on the
 * auth server (else `unauthorized_client`). Keep the `device_code` on the
 * backend: whoever holds it receives the user's tokens once they approve.
 *
 * @throws {OAuthEndpointError} when the auth server refuses the request
 * (`unauthorized_client`, `invalid_scope`, `invalid_target`, `invalid_client`).
 */
export async function startDeviceAuthorization({
  scope,
  resource,
  ...credentials
}: IStartDeviceAuthorizationOptions): Promise<DeviceAuthorizationResponse> {
  if (resource !== undefined && (typeof resource !== "string" || resource.length === 0)) {
    throw new TypeError("Expected 'resource' to be a non-empty string when set!");
  }
  const form = new URLSearchParams();
  if (scope !== undefined) {
    const serialized: string = formatScope(scope);
    if (serialized.length > 0) {
      form.set("scope", serialized);
    }
  }
  if (resource !== undefined) {
    form.set(OIDC_TOKEN_RESOURCE_PARAM, resource);
  }

  const response: Response = await postAsConfidentialClient(
    credentials,
    "device authorization",
    getOidcEndpointUrl(credentials.auth_server_url, "device_authorization"),
    form,
  );
  const parsed = deviceAuthorizationResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new Error(
      "Received an unexpected device authorization response from the auth server",
      { cause: parsed.error },
    );
  }
  return parsed.data;
}

export default startDeviceAuthorization;
