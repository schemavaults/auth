import { describe, expect, test } from "bun:test";
import {
  DEVICE_POLL_INTERVAL_TOLERANCE_MS,
  MAX_DEVICE_POLL_INTERVAL_SECONDS,
  evaluateDevicePoll,
} from "./evaluate-device-poll";
import type { DeviceAuthorization } from "./shared";

const CREATED_AT = 1_700_000_000_000;
const EXPIRES_AT = CREATED_AT + 15 * 60 * 1000;

function authorization(overrides: Partial<DeviceAuthorization> = {}): DeviceAuthorization {
  return {
    device_authorization_id: "00000000-0000-4000-8000-000000000001",
    client_app_id: "my-cli" as DeviceAuthorization["client_app_id"],
    requested_scope: "openid email",
    resource: null,
    status: "pending",
    uid: null,
    scope: null,
    scope_api_server_id: null,
    interval_seconds: 5,
    created_at: CREATED_AT,
    expires_at: EXPIRES_AT,
    last_polled_at: null,
    decided_at: null,
    redeemed_at: null,
    ...overrides,
  };
}

const approved = (overrides: Partial<DeviceAuthorization> = {}) =>
  authorization({
    status: "approved",
    uid: "00000000-0000-4000-8000-0000000000aa",
    decided_at: CREATED_AT + 60_000,
    scope: "openid email",
    ...overrides,
  });

describe("evaluateDevicePoll", () => {
  test("an unknown device code (or another client's) is invalid_grant", () => {
    expect(evaluateDevicePoll(null, CREATED_AT)).toEqual({
      kind: "invalid_grant",
      reason: "unknown",
    });
  });

  test("the first poll of a pending request is authorization_pending", () => {
    expect(evaluateDevicePoll(authorization(), CREATED_AT + 1000)).toEqual({
      kind: "authorization_pending",
    });
  });

  test("a poll at the interval is on time", () => {
    const last = CREATED_AT + 10_000;
    expect(
      evaluateDevicePoll(authorization({ last_polled_at: last }), last + 5000),
    ).toEqual({ kind: "authorization_pending" });
    // Within the tolerance it still counts as on time.
    expect(
      evaluateDevicePoll(
        authorization({ last_polled_at: last }),
        last + 5000 - DEVICE_POLL_INTERVAL_TOLERANCE_MS,
      ),
    ).toEqual({ kind: "authorization_pending" });
  });

  test("polling sooner than the interval is slow_down, with 5 more seconds", () => {
    const last = CREATED_AT + 10_000;
    expect(
      evaluateDevicePoll(authorization({ last_polled_at: last }), last + 1000),
    ).toEqual({ kind: "slow_down", interval_seconds: 10 });
    expect(
      evaluateDevicePoll(
        authorization({ last_polled_at: last, interval_seconds: 10 }),
        last + 6000,
      ),
    ).toEqual({ kind: "slow_down", interval_seconds: 15 });
  });

  test("the interval never grows past the cap", () => {
    const last = CREATED_AT + 10_000;
    expect(
      evaluateDevicePoll(
        authorization({
          last_polled_at: last,
          interval_seconds: MAX_DEVICE_POLL_INTERVAL_SECONDS,
        }),
        last + 1000,
      ),
    ).toEqual({ kind: "slow_down", interval_seconds: MAX_DEVICE_POLL_INTERVAL_SECONDS });
  });

  test("an approved request is redeemed, even when polled early", () => {
    const last = CREATED_AT + 10_000;
    expect(evaluateDevicePoll(approved({ last_polled_at: last }), last + 100)).toEqual({
      kind: "redeem",
    });
  });

  test("a denied request is access_denied, before and after it expires", () => {
    const denied = authorization({
      status: "denied",
      uid: "00000000-0000-4000-8000-0000000000aa",
      decided_at: CREATED_AT + 1000,
    });
    expect(evaluateDevicePoll(denied, CREATED_AT + 2000)).toEqual({ kind: "access_denied" });
    expect(evaluateDevicePoll(denied, EXPIRES_AT + 1)).toEqual({ kind: "access_denied" });
  });

  test("an expired request is expired_token, approved or not", () => {
    expect(evaluateDevicePoll(authorization(), EXPIRES_AT)).toEqual({ kind: "expired_token" });
    expect(evaluateDevicePoll(approved(), EXPIRES_AT + 1)).toEqual({ kind: "expired_token" });
  });

  test("a redeemed device code is spent", () => {
    expect(
      evaluateDevicePoll(
        approved({ status: "redeemed", redeemed_at: CREATED_AT + 70_000 }),
        CREATED_AT + 80_000,
      ),
    ).toEqual({ kind: "invalid_grant", reason: "redeemed" });
  });
});
