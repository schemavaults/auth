import "server-only";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  type IProtectedAuthenticatedApiRouteProps,
  withAuthenticatedApiRouteGuard,
} from "@/lib/withAuthenticatedRouteGuard";
import { MfaRegistry } from "@/lib/auth-db";
import { verifyTotpCode } from "@/lib/mfa";
import { mfaCodeOnlyBodySchema } from "@schemavaults/auth-common";
import type { ServerRuntime } from "next";
import captureServerException from "@/lib/captureServerException";
import { sendMfaSecurityAlertEmail } from "@/lib/mfa/send-mfa-security-alert-email";

const ROUTE = "/api/user/mfa/totp/[factor_id]";

const factorIdSchema = z.string().uuid();

async function DELETE_factor_handler(
  { user, dbh, redis, req }: IProtectedAuthenticatedApiRouteProps,
  factor_id: string,
): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, message: "Invalid body JSON" },
      { status: 400 },
    );
  }
  const parsed = await mfaCodeOnlyBodySchema.safeParseAsync(body);
  if (!parsed.success) {
    return NextResponse.json(parsed.error, { status: 400 });
  }
  const { code } = parsed.data;

  const mfaRegistry = new MfaRegistry(dbh.db);

  try {
    // Authorize the destructive change with a current TOTP code from the
    // factor being removed — proving the caller controls it. One targeted
    // lookup against the named factor rather than trying every enrolled
    // factor's secret. Works for an unverified (partially-enrolled) factor
    // too, since its secret is the only credential available.
    const factor = await mfaRegistry.getFactorWithSecretById({
      uid: user.uid,
      factor_id,
    });
    if (!factor) {
      return NextResponse.json(
        { success: false, message: "Factor not found" },
        { status: 404 },
      );
    }
    if (!verifyTotpCode({ secret: factor.secret, code })) {
      return NextResponse.json(
        { success: false, message: "Invalid TOTP code" },
        { status: 401 },
      );
    }

    // Delete this factor and (if it was the last verified factor) wipe
    // recovery codes too.
    const verifiedSummaries = await mfaRegistry.listVerifiedFactorsForUser(
      user.uid,
    );
    const isLastVerifiedFactor =
      factor.row.verified &&
      verifiedSummaries.length === 1 &&
      verifiedSummaries[0]?.factor_id === factor_id;
    if (isLastVerifiedFactor) {
      await mfaRegistry.deleteAllFactorsForUser(user.uid);
    } else {
      await mfaRegistry.deleteFactor({ uid: user.uid, factor_id });
    }

    await sendMfaSecurityAlertEmail({
      to: user.email,
      action: "removed",
      db: dbh.db,
      redis
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (e: unknown) {
    await captureServerException(dbh.db, e, {
      op_name: "DELETE_factor_handler",
      route: ROUTE,
      uid: user.uid,
    });
    return NextResponse.json(
      { success: false, message: "Failed to remove factor" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  req: NextRequest,
  ctx: RouteContext<"/api/user/mfa/totp/[factor_id]">,
): Promise<NextResponse> {
  const { factor_id } = await ctx.params;
  const parsed = factorIdSchema.safeParse(factor_id);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: "Invalid factor_id in URL" },
      { status: 400 },
    );
  }
  return await (
    await withAuthenticatedApiRouteGuard((props) =>
      DELETE_factor_handler(props, parsed.data),
    )
  )(req);
}

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
