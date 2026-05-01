import "server-only";
import { type NextRequest, NextResponse } from "next/server";
import {
  type IProtectedAuthenticatedApiRouteProps,
  withAuthenticatedApiRouteGuard,
} from "@/lib/withAuthenticatedRouteGuard";
import { MfaRegistry } from "@/lib/auth-db";
import {
  mfaStatusResponseSchema,
  type MfaStatusResponse,
} from "@schemavaults/auth-common";
import type { ServerRuntime } from "next";
import captureServerException from "@/lib/captureServerException";

const ROUTE = "/api/user/mfa/status";

async function GET_status_handler(
  { user, dbh }: IProtectedAuthenticatedApiRouteProps,
): Promise<NextResponse> {
  try {
    const mfaRegistry = new MfaRegistry(dbh.db);
    const verified = await mfaRegistry.getVerifiedFactor(user.uid);
    const payload: MfaStatusResponse = await (async () => {
      if (!verified) {
        return { enabled: false } satisfies MfaStatusResponse;
      }
      const recovery_codes_remaining =
        await mfaRegistry.countRecoveryCodesRemaining(user.uid);
      // Postgres returns BIGINT columns as strings; coerce to number so the
      // mfaStatusResponseSchema (which expects z.number()) parses on both
      // ends of the wire.
      const verified_at_raw = verified.row.verified_at;
      const verified_at =
        verified_at_raw == null ? undefined : Number(verified_at_raw);
      return {
        enabled: true,
        factor_id: verified.row.factor_id,
        factor_type: "totp",
        verified_at,
        recovery_codes_remaining,
      } satisfies MfaStatusResponse;
    })();

    const parsed = mfaStatusResponseSchema.safeParse(payload);
    if (!parsed.success) {
      await captureServerException(dbh.db, parsed.error, {
        op_name: "GET_status_handler:response_schema_mismatch",
        route: ROUTE,
        uid: user.uid,
      });
      return NextResponse.json(
        { success: false, message: "Failed to load MFA status" },
        { status: 500 },
      );
    }
    return NextResponse.json(parsed.data, { status: 200 });
  } catch (e: unknown) {
    await captureServerException(dbh.db, e, {
      op_name: "GET_status_handler",
      route: ROUTE,
      uid: user.uid,
    });
    return NextResponse.json(
      { success: false, message: "Failed to load MFA status" },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  return await (await withAuthenticatedApiRouteGuard(GET_status_handler))(req);
}

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
