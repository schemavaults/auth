import "server-only";
import type { Kysely } from "@schemavaults/dbh";
import type { AppId } from "@schemavaults/app-definitions";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import hashToken from "@/lib/auth-db/users/hash-token";
import { evaluateDevicePoll, type DevicePollOutcome } from "./evaluate-device-poll";
import {
  DEVICE_AUTHORIZATION_COLUMNS,
  toDeviceAuthorization,
  type DeviceAuthorization,
} from "./shared";

export type DevicePollResult =
  | Exclude<DevicePollOutcome, { kind: "redeem" }>
  /** The approved request, now redeemed: issue its tokens. */
  | { kind: "redeemed"; authorization: DeviceAuthorization & { uid: string } };

export interface PollDeviceAuthorizationOptions {
  device_code: string;
  client_app_id: AppId;
  now?: number;
}

/**
 * Answers a device's poll of the token endpoint (RFC 8628 §3.4). Locks the
 * request's row, decides with evaluateDevicePoll() and records the poll:
 * the time (for `slow_down`), the longer interval after a `slow_down`, and,
 * for an approved request, its redemption — so a device code yields tokens
 * exactly once, however many polls race. A device code issued to another
 * client is treated as unknown.
 */
export async function pollDeviceAuthorization(
  db: Kysely<AuthDatabase>,
  { device_code, client_app_id, now = Date.now() }: PollDeviceAuthorizationOptions,
): Promise<DevicePollResult> {
  const device_code_hash: string = await hashToken(device_code);
  return await db.transaction().execute(async (trx): Promise<DevicePollResult> => {
    const row = await trx
      .selectFrom("device_authorizations")
      .select(DEVICE_AUTHORIZATION_COLUMNS)
      .where("device_code_hash", "=", device_code_hash)
      .forUpdate()
      .executeTakeFirst();
    const authorization: DeviceAuthorization | null =
      row && row.client_app_id === client_app_id ? toDeviceAuthorization(row) : null;

    const outcome: DevicePollOutcome = evaluateDevicePoll(authorization, now);
    if (authorization === null) {
      return outcome as DevicePollResult;
    }
    const update = (
      values: Partial<Pick<DeviceAuthorization, "status" | "interval_seconds" | "last_polled_at" | "redeemed_at">>,
    ) =>
      trx
        .updateTable("device_authorizations")
        .set(values)
        .where("device_authorization_id", "=", authorization.device_authorization_id)
        .execute();

    switch (outcome.kind) {
      case "authorization_pending":
        await update({ last_polled_at: now });
        return outcome;
      case "slow_down":
        await update({ last_polled_at: now, interval_seconds: outcome.interval_seconds });
        return outcome;
      case "redeem": {
        if (authorization.uid === null) {
          // The status CHECK constraint makes this unreachable.
          throw new Error("An approved device authorization has no user");
        }
        await update({ status: "redeemed", redeemed_at: now, last_polled_at: now });
        return {
          kind: "redeemed",
          authorization: { ...authorization, uid: authorization.uid, status: "redeemed", redeemed_at: now },
        };
      }
      default:
        return outcome;
    }
  });
}

export default pollDeviceAuthorization;
