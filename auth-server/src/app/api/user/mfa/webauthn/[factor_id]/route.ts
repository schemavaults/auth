import "server-only";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  type IProtectedAuthenticatedApiRouteProps,
  withAuthenticatedApiRouteGuard,
} from "@/lib/withAuthenticatedRouteGuard";
import { MfaRegistry } from "@/lib/auth-db";
import {
  getStepUpChallenge,
  deleteStepUpChallenge,
} from "@/lib/mfa";
import { evaluateMfaProof } from "@/app/api/auth/mfa/verify/evaluate-proof";
import { mfaProofSchema } from "@schemavaults/auth-common";
import type { ServerRuntime } from "next";
import captureServerException from "@/lib/captureServerException";
import { sendMfaSecurityAlertEmail } from "@/lib/mfa/send-mfa-security-alert-email";

const ROUTE = "/api/user/mfa/webauthn/[factor_id]";

const factorIdSchema = z.string().uuid();

// Removing a passkey requires step-up proof of a current factor — proving the
// caller still controls the account, consistent with TOTP removal requiring a
// current code. The proof may be: a TOTP code (if the user has TOTP), a fresh
// passkey assertion (challenge from /webauthn/authenticate-options), or a
// recovery code.
const deleteBodySchema = z
  .object({
    proof: mfaProofSchema,
  })
  .strict();

async function DELETE_webauthn_factor_handler(
  { user, dbh, req, redis }: IProtectedAuthenticatedApiRouteProps,
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
  const parsed = await deleteBodySchema.safeParseAsync(body);
  if (!parsed.success) {
    return NextResponse.json(parsed.error, { status: 400 });
  }
  const { proof } = parsed.data;

  const mfaRegistry = new MfaRegistry(dbh.db);

  try {
    const factor = await mfaRegistry.getFactorById({
      uid: user.uid,
      factor_id,
    });
    if (!factor || factor.factor_type !== "webauthn") {
      return NextResponse.json(
        { success: false, message: "Passkey not found" },
        { status: 404 },
      );
    }

    // For a webauthn step-up proof, consume the per-user assertion challenge
    // issued by /webauthn/authenticate-options (one-shot).
    let webauthnChallenge: string | null = null;
    if (proof.type === "webauthn") {
      webauthnChallenge = await getStepUpChallenge(redis.client, user.uid);
      await deleteStepUpChallenge(redis.client, user.uid);
    }

    const proofValid = await evaluateMfaProof({
      mfaRegistry,
      uid: user.uid,
      proof,
      webauthnChallenge,
    });
    if (!proofValid) {
      return NextResponse.json(
        { success: false, message: "Invalid verification" },
        { status: 401 },
      );
    }

    // If this is the user's last verified factor, wipe recovery codes too.
    const verifiedSummaries = await mfaRegistry.listVerifiedFactorsForUser(
      user.uid,
    );
    const isLastVerifiedFactor =
      factor.verified &&
      verifiedSummaries.length === 1 &&
      verifiedSummaries[0]?.factor_id === factor_id;
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
      op_name: "DELETE_webauthn_factor_handler",
      route: ROUTE,
      uid: user.uid,
    });
    return NextResponse.json(
      { success: false, message: "Failed to remove passkey" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  req: NextRequest,
  ctx: RouteContext<"/api/user/mfa/webauthn/[factor_id]">,
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
      DELETE_webauthn_factor_handler(props, parsed.data),
    )
  )(req);
}

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
