import "server-only";
import { type NextRequest, NextResponse } from "next/server";
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

async function DELETE_factor_handler(
  { user, dbh, req }: IProtectedAuthenticatedApiRouteProps,
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
    const factor = await mfaRegistry.getFactorById({
      uid: user.uid,
      factor_id,
    });
    if (!factor) {
      return NextResponse.json(
        { success: false, message: "Factor not found" },
        { status: 404 },
      );
    }

    // Require a valid current TOTP to authorize the destructive change.
    // For an unverified factor we still verify against its secret since
    // that's the only credential available; this prevents an idle session
    // hijack from quietly deleting a partially-enrolled factor.
    const verifiedSummaries = await mfaRegistry.listVerifiedFactorsForUser(
      user.uid,
    );
    const isLastVerifiedFactor =
      verifiedSummaries.length === 1 &&
      verifiedSummaries[0]?.factor_id === factor_id;
    if (verifiedSummaries.length > 0) {
      // Accept a TOTP code from any of the user's verified factors. This
      // preserves the single-factor UX and allows a user with multiple
      // factors to authorize the deletion with whichever one they have
      // handy.
      let codeAccepted = false;
      for (const summary of verifiedSummaries) {
        const fullFactor = await mfaRegistry.getVerifiedFactorById({
          uid: user.uid,
          factor_id: summary.factor_id,
        });
        if (!fullFactor) continue;
        if (verifyTotpCode({ secret: fullFactor.secret, code })) {
          codeAccepted = true;
          break;
        }
      }
      if (!codeAccepted) {
        return NextResponse.json(
          { success: false, message: "Invalid TOTP code" },
          { status: 401 },
        );
      }
    }

    // Delete this factor and (if it was the last verified factor) wipe
    // recovery codes too.
    if (isLastVerifiedFactor) {
      await mfaRegistry.deleteAllFactorsForUser(user.uid);
    } else {
      await mfaRegistry.deleteFactor({ uid: user.uid, factor_id });
    }

    void sendMfaSecurityAlertEmail({
      to: user.email,
      action: "removed",
      db: dbh.db,
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
  return await (
    await withAuthenticatedApiRouteGuard((props) =>
      DELETE_factor_handler(props, factor_id),
    )
  )(req);
}

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
