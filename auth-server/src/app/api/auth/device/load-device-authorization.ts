import "server-only";
import { NextResponse } from "next/server";
import type Redis from "ioredis";
import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import type { DeviceAuthorization } from "@/lib/auth-db/device-authorizations";
import type { DeviceVerificationErrorId } from "@/lib/api/domain-schemas/device-authorization";
import { findDeviceAuthorizationForUser } from "@/lib/device-verification";
import { extractClientIp, rateLimitResponse } from "@/lib/rate-limit";

/** The `{ success: false, message, error_id }` refusal of the `/api/auth/device/*` endpoints. */
export function deviceVerificationError(
  status: number,
  error_id: DeviceVerificationErrorId,
  message: string,
): NextResponse {
  return NextResponse.json(
    { success: false, message, error_id },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export const INVALID_USER_CODE_MESSAGE =
  "That code is not valid, or it has expired. Check the code shown on your device, or start again on the device." as const;

/**
 * The pending device authorization the request's user code names, for the
 * signed-in `uid`; or the response refusing it (404 `invalid_user_code`, or
 * 429 after too many unknown codes).
 */
export async function loadDeviceAuthorizationForRequest({
  db,
  redis,
  uid,
  request,
  user_code,
}: {
  db: Kysely<AuthDatabase>;
  redis: Redis;
  uid: string;
  request: Request;
  user_code: string;
}): Promise<
  { ok: true; authorization: DeviceAuthorization } | { ok: false; response: NextResponse }
> {
  const found = await findDeviceAuthorizationForUser({
    db,
    redis,
    uid,
    ip: extractClientIp(request),
    user_code,
  });
  switch (found.kind) {
    case "found":
      return { ok: true, authorization: found.authorization };
    case "rate_limited":
      return { ok: false, response: rateLimitResponse(found.result) };
    case "not_found":
      return {
        ok: false,
        response: deviceVerificationError(404, "invalid_user_code", INVALID_USER_CODE_MESSAGE),
      };
  }
}
