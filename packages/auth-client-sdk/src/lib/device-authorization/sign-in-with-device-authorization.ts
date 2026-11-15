// sign-in-with-device-authorization.ts
//
// Signs a user in on a device that cannot show the login page (a CLI, a TV
// app) with the Device Authorization Grant (RFC 8628): request a code, show
// it, poll until the user approves it on the auth server's `/device` page,
// then store the session exactly as a browser sign-in does.

import { parseAndGrantScopes, formatScope } from "@schemavaults/auth-common";
import { normalizeOidcIssuer } from "@/lib/oidc";
import establishSessionFromTokenResponse, {
  type EstablishSessionFromTokenResponseOpts,
} from "@/lib/establish-session-from-token-response";
import requestDeviceAuthorization, {
  type DeviceAuthorizationRequestOptions,
  type IRequestDeviceAuthorizationOpts,
} from "./request-device-authorization";
import pollDeviceAuthorization from "./poll-device-authorization";

/** What to show the user while the device waits for their approval. */
export interface DeviceAuthorizationPrompt {
  /** The code to enter, formatted for display ("BCDF-GHJK"). */
  user_code: string;
  /** The page to enter it on (the auth server's `/device`). */
  verification_uri: string;
  /** The same page with the code filled in, for a link or QR code. */
  verification_uri_complete: string | undefined;
  /** Seconds until the code expires. */
  expires_in: number;
  /** When the code expires (Unix epoch ms). */
  expires_at: number;
}

export interface SignInWithDeviceAuthorizationOptions
  extends Partial<DeviceAuthorizationRequestOptions> {
  /**
   * Shows the user the code and where to enter it. Called once, before
   * polling starts; polling waits for a returned promise.
   */
  onUserCode: (prompt: DeviceAuthorizationPrompt) => void | Promise<void>;
  /** Stops waiting for the user (the request then simply expires). */
  signal?: AbortSignal;
}

export interface ISignInWithDeviceAuthorizationOpts
  extends Omit<IRequestDeviceAuthorizationOpts, "scope" | "resource">,
    Omit<
      EstablishSessionFromTokenResponseOpts,
      | "tokens"
      | "first_audience"
      | "remaining_audiences"
      | "wantsHttpOnlyRefreshTokenCookie"
      | "issuer"
      | "adapter"
    > {
  options: SignInWithDeviceAuthorizationOptions;
  /** The scope when `options.scope` is omitted. */
  default_scope: string;
  /** The client's default token audience(s), as for a browser sign-in. */
  defaultTokenAudiences: string | string[];
}

/**
 * Runs the whole device sign-in: requests a device authorization, hands the
 * user code to `onUserCode`, polls until the user approves, and stores the
 * refresh token, access token(s) and user data. The scope must include
 * `openid`: the session is bound to the id_token's subject.
 *
 * The access token is minted for the first default audience, as on the
 * browser sign-in, and the remaining default audiences are acquired through
 * refresh grants right after. API scopes requested for `resource` are
 * approved on the device page and go on the access tokens minted for that
 * API server (list it among the default audiences, or acquire a token for
 * it afterwards).
 *
 * @throws {TokenEndpointRequestFailedError} when the auth server refuses the
 * request, or the user denies it (`oauth_error: "access_denied"`) or lets it
 * expire (`"expired_token"`).
 */
export async function signInWithDeviceAuthorization({
  options,
  default_scope,
  defaultTokenAudiences,
  auth_server_url,
  client_app_id,
  environment,
  adapter,
  ...session
}: ISignInWithDeviceAuthorizationOpts): Promise<void> {
  if (typeof options?.onUserCode !== "function") {
    throw new TypeError("Expected an 'onUserCode' callback to show the user code!");
  }
  const scope: string = formatScope(options.scope ?? default_scope);
  if (!parseAndGrantScopes(scope).hasOpenid) {
    throw new TypeError(
      "signInWithDeviceAuthorization() needs the 'openid' scope; use requestDeviceAuthorization() and pollDeviceAuthorization() for a plain OAuth 2.0 grant.",
    );
  }

  const device_authorization = await requestDeviceAuthorization({
    auth_server_url,
    client_app_id,
    environment,
    adapter,
    scope,
    ...(options.resource !== undefined ? { resource: options.resource } : {}),
  });
  await options.onUserCode({
    user_code: device_authorization.user_code,
    verification_uri: device_authorization.verification_uri,
    verification_uri_complete: device_authorization.verification_uri_complete,
    expires_in: device_authorization.expires_in,
    expires_at: Date.now() + device_authorization.expires_in * 1000,
  });

  const audiences: string[] = (
    Array.isArray(defaultTokenAudiences) ? defaultTokenAudiences : [defaultTokenAudiences]
  ).filter((audience) => typeof audience === "string" && audience.length > 0);
  const first_audience: string | undefined = audiences[0];
  const wantsHttpOnlyRefreshTokenCookie: boolean =
    typeof adapter.doesSupportHttpOnlyRefreshToken === "function" &&
    adapter.doesSupportHttpOnlyRefreshToken();

  const tokens = await pollDeviceAuthorization({
    auth_server_url,
    client_app_id,
    environment,
    adapter,
    device_authorization,
    ...(first_audience !== undefined ? { resource: first_audience } : {}),
    refresh_token_as_http_only_cookie: wantsHttpOnlyRefreshTokenCookie,
    ...(options.signal ? { signal: options.signal } : {}),
  });

  await establishSessionFromTokenResponse({
    ...session,
    tokens,
    first_audience,
    remaining_audiences: audiences.slice(1),
    wantsHttpOnlyRefreshTokenCookie,
    issuer: normalizeOidcIssuer(auth_server_url),
    adapter,
  });
}

export default signInWithDeviceAuthorization;
