import "server-only";
import { type NextRequest, NextResponse } from "next/server";
import {
  type IProtectedAuthenticatedApiRouteProps,
  withAuthenticatedApiRouteGuard,
} from "@/lib/withAuthenticatedRouteGuard";
import { MfaRegistry } from "@/lib/auth-db";
import {
  mfaFactorTypeSchema,
  mfaFactorStatusResponseSchema,
  type MfaFactorType,
  type MfaFactorStatusResponse,
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
    // Filter by factor_type in SQL and include in-progress (unverified)
    // enrollments so the status reflects a pending setup, not just active
    // factors.
    const factor = await mfaRegistry.getFactorByType({
      uid: user.uid,
      factor_type,
    });

    const payload: MfaFactorStatusResponse = ((): MfaFactorStatusResponse => {
      if (!factor) {
        return { enabled: false, pending: false };
      }
      if (factor.verified) {
        // Postgres returns BIGINT columns as strings; coerce to number.
        const verified_at_raw = factor.verified_at;
        return {
          enabled: true,
          pending: false,
          factor_id: factor.factor_id,
          factor_type,
          verified_at:
            verified_at_raw == null ? undefined : Number(verified_at_raw),
        };
      }
      // An unverified factor row means enrollment is in progress.
      return {
        enabled: false,
        pending: true,
        factor_id: factor.factor_id,
        factor_type,
      };
    })();

    const parsed = mfaFactorStatusResponseSchema.safeParse(payload);
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
  // Params are parsed inside the guard so unauthenticated callers get a
  // 401 without observing whether the factor type was well-formed.
  return await (
    await withAuthenticatedApiRouteGuard(async (props) => {
      const { factor_type } = await ctx.params;
      const parsed = mfaFactorTypeSchema.safeParse(factor_type);
      if (!parsed.success) {
        return NextResponse.json(
          { success: false, message: "Unknown MFA factor type" },
          { status: 400 },
        );
      }
      return GET_status_for_factor_type_handler(props, parsed.data);
    })
  )(req);
}

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
