import {
  DEVICE_AUTHORIZATION_DEFAULT_INTERVAL_SECONDS,
  DEVICE_AUTHORIZATION_SLOW_DOWN_INCREMENT_SECONDS,
  OAUTH_DEVICE_CODE_GRANT_TYPE,
  OIDC_TOKEN_RESOURCE_PARAM,
  getOidcEndpointUrl,
} from "@schemavaults/auth-common";
import { z } from "zod";
import {
  OAuthEndpointError,
  type ConfidentialClientCredentials,
  postAsConfidentialClient,
} from "./shared";

/** The token response of a redeemed device code (RFC 6749 §5.1). */
export const deviceAccessTokenResponseSchema = z.looseObject({
  access_token: z.string().min(1),
  token_type: z.literal("Bearer"),
  expires_in: z.number().int().positive(),
  refresh_token: z.string().min(1).optional(),
  /** @schemavaults/auth-server extension: seconds until the refresh token expires. */
  refresh_token_expires_in: z.number().int().positive().optional(),
  scope: z.string().optional(),
  /** Present when the approved scope includes `openid`. */
  id_token: z.string().min(1).optional(),
});

export type DeviceAccessTokenResponse = z.infer<typeof deviceAccessTokenResponseSchema>;

export interface IRequestDeviceAccessTokenOptions extends ConfidentialClientCredentials {
  /** The `device_code` of `startDeviceAuthorization()`. */
  device_code: string;
  /** RFC 8707 resource indicator: the API server to mint the access token for. */
  resource?: string;
}

/** One poll's answer, short of tokens. */
export type DeviceAccessTokenPollResult =
  | { status: "tokens"; tokens: DeviceAccessTokenResponse }
  /** The user has not decided yet: poll again after the interval. */
  | { status: "authorization_pending" }
  /** As pending, but polled too fast: wait 5 more seconds from now on. */
  | { status: "slow_down" };

/**
 * Polls the token endpoint ONCE with a device code (RFC 8628 §3.4), for
 * backends that schedule the polls themselves. Waiting between polls is the
 * caller's job: at least `interval` seconds, plus 5 more after every
 * `slow_down`.
 *
 * @throws {OAuthEndpointError} when no tokens will come: `access_denied` (the
 * user denied the request), `expired_token` (the code expired), or another
 * RFC 6749 §5.2 code (`invalid_grant`: unknown or already redeemed;
 * `unauthorized_client`: the grant was disabled for the app).
 */
export async function requestDeviceAccessToken({
  device_code,
  resource,
  ...credentials
}: IRequestDeviceAccessTokenOptions): Promise<DeviceAccessTokenPollResult> {
  if (typeof device_code !== "string" || device_code.length === 0) {
    throw new TypeError("Expected a device_code to poll with!");
  }
  const form = new URLSearchParams({ grant_type: OAUTH_DEVICE_CODE_GRANT_TYPE, device_code });
  if (resource !== undefined) {
    form.set(OIDC_TOKEN_RESOURCE_PARAM, resource);
  }
  let response: Response;
  try {
    response = await postAsConfidentialClient(
      credentials,
      "token",
      getOidcEndpointUrl(credentials.auth_server_url, "token"),
      form,
    );
  } catch (e: unknown) {
    if (e instanceof OAuthEndpointError) {
      if (e.error === "authorization_pending") return { status: "authorization_pending" };
      if (e.error === "slow_down") return { status: "slow_down" };
    }
    throw e;
  }
  const parsed = deviceAccessTokenResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new Error("Received an unexpected token response from the auth server", {
      cause: parsed.error,
    });
  }
  return { status: "tokens", tokens: parsed.data };
}

export interface IPollDeviceAuthorizationOptions extends IRequestDeviceAccessTokenOptions {
  /** The `interval` of the device authorization response (default 5 seconds). */
  interval?: number;
  /**
   * Stops polling (e.g. when the user cancels on the device). Without one,
   * polling ends when the auth server answers `expired_token`.
   */
  signal?: AbortSignal;
}

function wait(seconds: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, seconds * 1000);
    function onAbort(): void {
      clearTimeout(timer);
      reject(signal?.reason);
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Polls the token endpoint with a device code until the user approves the
 * request on the auth server's `/device` page (RFC 8628 §3.4-3.5), waiting
 * `interval` seconds between polls and 5 more after every `slow_down`.
 * Resolves with the user's tokens: an access token, a refresh token, and an
 * id_token when the approved scope includes `openid`.
 *
 * @throws {OAuthEndpointError} `access_denied` when the user denies the
 * request, `expired_token` when it expires first, or another RFC 6749 §5.2
 * code. An aborted `signal` rejects with its reason.
 */
export async function pollDeviceAuthorization({
  interval = DEVICE_AUTHORIZATION_DEFAULT_INTERVAL_SECONDS,
  signal,
  ...request
}: IPollDeviceAuthorizationOptions): Promise<DeviceAccessTokenResponse> {
  if (!Number.isFinite(interval) || interval <= 0) {
    throw new TypeError("Expected 'interval' to be a positive number of seconds!");
  }
  let current_interval: number = interval;
  for (;;) {
    await wait(current_interval, signal);
    const result = await requestDeviceAccessToken(request);
    if (result.status === "tokens") {
      return result.tokens;
    }
    if (result.status === "slow_down") {
      current_interval += DEVICE_AUTHORIZATION_SLOW_DOWN_INCREMENT_SECONDS;
    }
  }
}

export default pollDeviceAuthorization;
