import "server-only";
import { getAppEnvironment } from "@schemavaults/app-definitions";
import { NextRequest, NextResponse } from "next/server";
import { ServerlessDatabase, UserRegistry, type UserDocument } from "@/lib/auth-db";
import type { ServerRuntime } from "next/types";

const notFoundBody = {
  error: true,
  success: false,
  message: "Route not available in this environment",
} as const;

/**
 * Test-only endpoint that creates a password reset token for a user and returns
 * the raw token directly (bypassing email sending). This allows E2E tests to
 * exercise the password reset flow without needing to mock or intercept emails.
 *
 * GET /api/test/password-reset-token/:email
 *
 * Returns: { success: true, token: string } or error
 */
export async function GET(
  _req: NextRequest,
  ctx: RouteContext<"/api/test/password-reset-token/[email]">,
): Promise<NextResponse> {
  if (getAppEnvironment() !== "test") {
    return NextResponse.json(notFoundBody, { status: 404 });
  }

  const email: string = decodeURIComponent((await ctx.params).email);
  if (!email || typeof email !== "string") {
    return NextResponse.json(
      { error: true, success: false, message: "Missing email parameter" },
      { status: 400 },
    );
  }

  await using dbh = ServerlessDatabase.createDBH();
  const userRegistry = new UserRegistry(dbh.db, true);

  const user: UserDocument | null = await userRegistry.getUserByEmail(email);
  if (!user) {
    return NextResponse.json(
      { error: true, success: false, message: `User not found: ${email}` },
      { status: 404 },
    );
  }

  try {
    const rawToken: string = await userRegistry.createPasswordResetToken(user.uid);
    return NextResponse.json(
      { error: false, success: true, token: rawToken },
      { status: 200 },
    );
  } catch (e: unknown) {
    console.error("[test/password-reset-token] Failed to create token:", e);
    return NextResponse.json(
      { error: true, success: false, message: "Failed to create password reset token" },
      { status: 500 },
    );
  }
}

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
