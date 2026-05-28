import "server-only";
import { type NextRequest, NextResponse } from "next/server";
import {
  type IProtectedAuthenticatedApiRouteProps,
  withAuthenticatedApiRouteGuard,
} from "@/lib/withAuthenticatedRouteGuard";
import { MfaRegistry } from "@/lib/auth-db";
import {
  mfaStatusResponseSchema,
  type MfaEnrolledFactor,
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
    const [verifiedSummaries, recovery_codes_remaining] = await Promise.all([
      mfaRegistry.listVerifiedFactorsForUser(user.uid),
      mfaRegistry.countRecoveryCodesRemaining(user.uid),
    ]);

    const factors: MfaEnrolledFactor[] = verifiedSummaries.map((summary) => ({
      factor_id: summary.factor_id,
      factor_type: summary.factor_type,
      verified_at:
        summary.verified_at == null ? undefined : summary.verified_at,
    }));

    const payload: MfaStatusResponse = {
      enabled: factors.length > 0,
      factors,
      recovery_codes_remaining,
    };

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
