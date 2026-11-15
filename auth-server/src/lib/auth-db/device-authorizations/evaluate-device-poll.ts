// What the token endpoint answers a device polling with its device code
// (RFC 8628 §3.4-3.5), as a pure function of the stored request and the
// time: unit-testable, and applied by pollDeviceAuthorization() under a
// row lock.

import { DEVICE_AUTHORIZATION_SLOW_DOWN_INCREMENT_SECONDS } from "@schemavaults/auth-common";
import type { DeviceAuthorization } from "./shared";

/**
 * Polls arriving up to this much earlier than the interval allows are still
 * on time: clients sleep `interval` seconds between polls, and timers and
 * request processing are not that precise.
 */
export const DEVICE_POLL_INTERVAL_TOLERANCE_MS = 500;

/** The polling interval never grows past this (seconds). */
export const MAX_DEVICE_POLL_INTERVAL_SECONDS = 120;

export type DevicePollOutcome =
  /** No such device code for this client, or it was already redeemed. */
  | { kind: "invalid_grant"; reason: "unknown" | "redeemed" }
  | { kind: "access_denied" }
  | { kind: "expired_token" }
  /** Still pending; `interval_seconds` is unchanged. */
  | { kind: "authorization_pending" }
  /** Still pending, and the client polled too fast: the new, longer interval. */
  | { kind: "slow_down"; interval_seconds: number }
  /** Approved: redeem it now. */
  | { kind: "redeem" };

/**
 * Decides the answer to a poll of `authorization` (null: the device code is
 * unknown, or was issued to another client) at `now`:
 *
 * 1. A redeemed device code is spent (`invalid_grant`).
 * 2. A denied request answers `access_denied`, until it is deleted.
 * 3. An expired one answers `expired_token`, approved or not.
 * 4. An approved one is redeemed, however soon after the last poll.
 * 5. A pending one answers `slow_down` when polled sooner than its interval
 *    after the previous poll (the interval grows by 5 seconds), else
 *    `authorization_pending`.
 */
export function evaluateDevicePoll(
  authorization: DeviceAuthorization | null,
  now: number,
): DevicePollOutcome {
  if (authorization === null) {
    return { kind: "invalid_grant", reason: "unknown" };
  }
  if (authorization.status === "redeemed") {
    return { kind: "invalid_grant", reason: "redeemed" };
  }
  if (authorization.status === "denied") {
    return { kind: "access_denied" };
  }
  if (now >= authorization.expires_at) {
    return { kind: "expired_token" };
  }
  if (authorization.status === "approved") {
    return { kind: "redeem" };
  }
  const last: number | null = authorization.last_polled_at;
  const too_soon: boolean =
    last !== null &&
    now - last <
      authorization.interval_seconds * 1000 - DEVICE_POLL_INTERVAL_TOLERANCE_MS;
  if (too_soon) {
    return {
      kind: "slow_down",
      interval_seconds: Math.min(
        MAX_DEVICE_POLL_INTERVAL_SECONDS,
        authorization.interval_seconds + DEVICE_AUTHORIZATION_SLOW_DOWN_INCREMENT_SECONDS,
      ),
    };
  }
  return { kind: "authorization_pending" };
}

export default evaluateDevicePoll;
