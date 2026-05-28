import "server-only";
import { type NextRequest, NextResponse } from "next/server";
import {
  type IProtectedAuthenticatedApiRouteProps,
  withAuthenticatedApiRouteGuard,
} from "@/lib/withAuthenticatedRouteGuard";
import { MfaRegistry } from "@/lib/auth-db";
import {
  mfaFactorTypeSchema,
  mfaStatusResponseSchema,
  type MfaFactorType,
  type MfaStatusResponse,
} from "@schemavaults/auth-common";
import type { ServerRuntime } from "next";
import captureServerException from "@/lib/captureServerException";

const ROUTE = "/api/user/mfa/status/[factor_type]";

async function GET_status_for_factor_type_handler(
  { user, dbh }: IProtectedAuthenticatedApiRouteProps,
  factor_type: MfaFactorType,
): Promise<NextResponse> {
  try {
    const mfaRegistry = new MfaRegistry(dbh.db);
    const verifiedSummaries = await mfaRegistry.listVerifiedFactorsForUser(
      user.uid,
    );
    const match = verifiedSummaries.find(
      (summary) => summary.factor_type === factor_type,
    );

    const payload: MfaStatusResponse = await (async () => {
      if (!match) {
        return { enabled: false } satisfies MfaStatusResponse;
      }
      const fullFactor = await mfaRegistry.getVerifiedFactorById({
        uid: user.uid,
        factor_id: match.factor_id,
      });
      const recovery_codes_remaining =
        await mfaRegistry.countRecoveryCodesRemaining(user.uid);
      // Postgres returns BIGINT columns as strings; coerce to number so the
      // mfaStatusResponseSchema (which expects z.number()) parses on both
      // ends of the wire.
      const verified_at_raw = fullFactor?.row.verified_at ?? null;
      const verified_at =
        verified_at_raw == null ? undefined : Number(verified_at_raw);
      return {
        enabled: true,
        factor_id: match.factor_id,
        factor_type: match.factor_type,
        verified_at,
        recovery_codes_remaining,
      } satisfies MfaStatusResponse;
    })();

    const parsed = mfaStatusResponseSchema.safeParse(payload);
    if (!parsed.success) {
      await captureServerException(dbh.db, parsed.error, {
        op_name: "GET_status_for_factor_type_handler:response_schema_mismatch",
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
      op_name: "GET_status_for_factor_type_handler",
      route: ROUTE,
      uid: user.uid,
    });
    return NextResponse.json(
      { success: false, message: "Failed to load MFA status" },
      { status: 500 },
    );
  }
}

export async function GET(
  req: NextRequest,
  ctx: RouteContext<"/api/user/mfa/status/[factor_type]">,
): Promise<NextResponse> {
  const { factor_type } = await ctx.params;
  const parsed = mfaFactorTypeSchema.safeParse(factor_type);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: "Unknown MFA factor type" },
      { status: 400 },
    );
  }
  return await (
    await withAuthenticatedApiRouteGuard((props) =>
      GET_status_for_factor_type_handler(props, parsed.data),
    )
  )(req);
}

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
