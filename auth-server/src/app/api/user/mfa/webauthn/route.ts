import "server-only";
import { type NextRequest, NextResponse } from "next/server";
import {
  type IProtectedAuthenticatedApiRouteProps,
  withAuthenticatedApiRouteGuard,
} from "@/lib/withAuthenticatedRouteGuard";
import { MfaRegistry } from "@/lib/auth-db";
import {
  webauthnCredentialListResponseSchema,
  type WebauthnCredentialListResponse,
} from "@schemavaults/auth-common";
import type { ServerRuntime } from "next";
import captureServerException from "@/lib/captureServerException";

const ROUTE = "/api/user/mfa/webauthn";

async function GET_webauthn_credentials_handler(
  { user, dbh }: IProtectedAuthenticatedApiRouteProps,
): Promise<NextResponse> {
  try {
    const mfaRegistry = new MfaRegistry(dbh.db);
    const rows = await mfaRegistry.listWebauthnCredentialsForUser(user.uid);

    const payload: WebauthnCredentialListResponse = {
      // Only surface verified passkeys in the account UI; pending
      // (unverified) enrollments are not yet usable factors.
      credentials: rows
        .filter((row) => row.verified)
        .map((row) => ({
          factor_id: row.factor_id,
          label: row.label,
          created_at: row.created_at,
          last_used_at: row.last_used_at,
        })),
    };

    const parsed = webauthnCredentialListResponseSchema.safeParse(payload);
    if (!parsed.success) {
      await captureServerException(dbh.db, parsed.error, {
        op_name: "GET_webauthn_credentials_handler:response_schema_mismatch",
        route: ROUTE,
        uid: user.uid,
      });
      return NextResponse.json(
        { success: false, message: "Failed to load passkeys" },
        { status: 500 },
      );
    }
    return NextResponse.json(parsed.data, { status: 200 });
  } catch (e: unknown) {
    await captureServerException(dbh.db, e, {
      op_name: "GET_webauthn_credentials_handler",
      route: ROUTE,
      uid: user.uid,
    });
    return NextResponse.json(
      { success: false, message: "Failed to load passkeys" },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  return await (
    await withAuthenticatedApiRouteGuard(GET_webauthn_credentials_handler)
  )(req);
}

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
