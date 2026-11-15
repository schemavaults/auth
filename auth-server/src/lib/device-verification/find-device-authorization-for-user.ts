import "server-only";
import type { Kysely } from "@schemavaults/dbh";
import type Redis from "ioredis";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import {
  findPendingDeviceAuthorizationByUserCode,
  type DeviceAuthorization,
} from "@/lib/auth-db/device-authorizations";
import {
  checkRateLimitCount,
  incrementRateLimitCounter,
  DEVICE_USER_CODE_MISS_IP_RATE_LIMIT,
  DEVICE_USER_CODE_MISS_UID_RATE_LIMIT,
  type RateLimitResult,
} from "@/lib/rate-limit";

function isExhausted(result: RateLimitResult): boolean {
  return !result.allowed || result.remaining <= 0;
}

export type FoundDeviceAuthorization =
  | { kind: "found"; authorization: DeviceAuthorization }
  /** No pending, unexpired request holds the code (the miss was counted). */
  | { kind: "not_found" }
  /** Too many misses lately: the code was not even looked up. */
  | { kind: "rate_limited"; result: RateLimitResult };

export interface FindDeviceAuthorizationForUserOptions {
  db: Kysely<AuthDatabase>;
  redis: Redis;
  /** The signed-in user entering the code. */
  uid: string;
  /** The request's client IP, when known. */
  ip: string | null;
  /** The code as the user typed it. */
  user_code: string;
}

/**
 * Looks up the pending device authorization a user code names, for the
 * signed-in user on the `/device` page (and its approve / deny calls).
 *
 * Guessing someone else's pending code (RFC 8628 §5.1) is held off by
 * counting MISSES, per account and per IP: a user typing their own code is
 * never slowed down, while after a handful of unknown codes every lookup is
 * refused until the window passes.
 */
export async function findDeviceAuthorizationForUser({
  db,
  redis,
  uid,
  ip,
  user_code,
}: FindDeviceAuthorizationForUserOptions): Promise<FoundDeviceAuthorization> {
  // The counters hold misses already made: a lookup is refused once they
  // reached the budget (`remaining` is 0), so exactly `maxAttempts` misses
  // are allowed per window.
  const by_uid = await checkRateLimitCount(redis, DEVICE_USER_CODE_MISS_UID_RATE_LIMIT, { uid });
  if (isExhausted(by_uid)) {
    return { kind: "rate_limited", result: by_uid };
  }
  if (ip !== null) {
    const by_ip = await checkRateLimitCount(redis, DEVICE_USER_CODE_MISS_IP_RATE_LIMIT, { ip });
    if (isExhausted(by_ip)) {
      return { kind: "rate_limited", result: by_ip };
    }
  }

  const authorization: DeviceAuthorization | null =
    await findPendingDeviceAuthorizationByUserCode(db, user_code);
  if (authorization !== null) {
    return { kind: "found", authorization };
  }

  await incrementRateLimitCounter(redis, DEVICE_USER_CODE_MISS_UID_RATE_LIMIT, { uid });
  if (ip !== null) {
    await incrementRateLimitCounter(redis, DEVICE_USER_CODE_MISS_IP_RATE_LIMIT, { ip });
  }
  return { kind: "not_found" };
}

export default findDeviceAuthorizationForUser;
