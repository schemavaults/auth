import "server-only";
import { type NextRequest, NextResponse } from "next/server";
import {
  type IProtectedAuthenticatedApiRouteProps,
  withAuthenticatedApiRouteGuard,
} from "@/lib/withAuthenticatedRouteGuard";
import { MfaRegistry } from "@/lib/auth-db";
import {
  generateWebauthnAuthenticationOptions,
  putStepUpChallenge,
} from "@/lib/mfa";
import {
  webauthnAuthenticationOptionsResponseSchema,
  type WebauthnAuthenticationOptionsResponse,
} from "@schemavaults/auth-common";
import type { ServerRuntime } from "next";
import captureServerException from "@/lib/captureServerException";

const ROUTE = "/api/user/mfa/webauthn/authenticate-options";

// Issues a WebAuthn assertion challenge so an authenticated user can re-prove
// possession of a passkey when authorizing a sensitive action (removing a
// passkey). The challenge is stored server-side keyed by uid and consumed by
// the DELETE handler. Distinct from the unauthenticated login-time options
// endpoint under /api/auth/mfa/webauthn/options.
async function POST_step_up_options_handler(
  { user, dbh, redis }: IProtectedAuthenticatedApiRouteProps,
): Promise<NextResponse> {
  try {
    const mfaRegistry = new MfaRegistry(dbh.db);
    const verified = (
      await mfaRegistry.listWebauthnCredentialsForUser(user.uid)
    ).filter((c) => c.verified);

    if (verified.length === 0) {
      return NextResponse.json(
        { success: false, message: "No passkeys enrolled" },
        { status: 409 },
      );
    }

    const options = await generateWebauthnAuthenticationOptions({
      allowCredentials: verified.map((c) => ({
        credential_id: c.credential_id,
        transports: c.transports,
      })),
    });

    await putStepUpChallenge(redis.client, {
      uid: user.uid,
      challenge: options.challenge,
    });

    const payload: WebauthnAuthenticationOptionsResponse = {
      options: options as unknown as Record<string, unknown>,
    };
    const parsed =
      webauthnAuthenticationOptionsResponseSchema.safeParse(payload);
    if (!parsed.success) {
      await captureServerException(dbh.db, parsed.error, {
        op_name: "POST_step_up_options_handler:response_schema_mismatch",
        route: ROUTE,
        uid: user.uid,
      });
      return NextResponse.json(
        { success: false, message: "Failed to start passkey verification" },
        { status: 500 },
      );
    }
    return NextResponse.json(parsed.data, { status: 200 });
  } catch (e: unknown) {
    await captureServerException(dbh.db, e, {
      op_name: "POST_step_up_options_handler",
      route: ROUTE,
      uid: user.uid,
    });
    return NextResponse.json(
      { success: false, message: "Failed to start passkey verification" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  return await (
    await withAuthenticatedApiRouteGuard(POST_step_up_options_handler)
  )(req);
}

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
