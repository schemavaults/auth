import "server-only";

import {
  ServerlessDatabase,
  type ResourceCreationResponse,
  UserRegistry,
  type UserDocument,
} from "@/lib/auth-db";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  type IProtectedAdminApiRouteProps,
  withAdminApiRouteGuard,
} from "@/lib/withAdminRouteGuard";
import type { ServerRuntime } from "next";
import sendVerificationEmail from "@/lib/send-verification-email";

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";

async function POST_resend_verification_handler(
  { user, dbh }: IProtectedAdminApiRouteProps,
  target_uid: string,
): Promise<NextResponse> {
  if (!user.admin) {
    return NextResponse.json(
      {
        success: false,
        message: "You must be an admin to use this resource!",
      } satisfies ResourceCreationResponse,
      { status: 403 },
    );
  }

  const registry = new UserRegistry(dbh.db);

  let targetUser: UserDocument | null;
  try {
    targetUser = await registry.getUserByUID(target_uid);
  } catch (e: unknown) {
    console.error(
      `[admin/resend-verification] Failed to load user '${target_uid}': `,
      e,
    );
    return NextResponse.json(
      {
        success: false,
        message: "Failed to load target user",
      } satisfies ResourceCreationResponse,
      { status: 500 },
    );
  }

  if (!targetUser) {
    return NextResponse.json(
      {
        success: false,
        message: "User not found",
      } satisfies ResourceCreationResponse,
      { status: 404 },
    );
  }

  if (targetUser.email_verified) {
    return NextResponse.json(
      {
        success: false,
        message: "User's email is already verified",
      } satisfies ResourceCreationResponse,
      { status: 409 },
    );
  }

  try {
    const rawToken: string = await registry.createEmailVerificationToken(
      targetUser.uid,
    );
    await sendVerificationEmail({
      email: targetUser.email,
      rawToken,
      db: dbh.db,
    });
  } catch (e: unknown) {
    console.error(
      `[admin/resend-verification] Failed to send verification email to user '${target_uid}': `,
      e,
    );
    return NextResponse.json(
      {
        success: false,
        message: "Failed to send verification email",
      } satisfies ResourceCreationResponse,
      { status: 500 },
    );
  }

  return NextResponse.json({
    success: true,
    message: "Verification email sent",
    resource_id: target_uid,
  } satisfies ResourceCreationResponse);
}

export async function POST(
  req: NextRequest,
  props: { params: Promise<{ uid: string }> },
): Promise<NextResponse> {
  const params = await props.params;

  let target_uid: string;
  try {
    if (
      typeof params !== "object" ||
      !params ||
      !("uid" in params) ||
      typeof params.uid !== "string"
    ) {
      throw new Error("Failed to load UID from dynamic [uid] route segment!");
    }
    const parsed = await z.string().uuid().safeParseAsync(params.uid);
    if (!parsed.success || parsed.data !== params.uid) {
      throw new Error("Invalid UUID supplied for target user!");
    }
    target_uid = parsed.data;
  } catch (e: unknown) {
    console.error(
      "[admin/resend-verification] Failed to parse target user ID: ",
      e,
    );
    return NextResponse.json(
      {
        success: false,
        message: "Failed to parse target user ID",
      } satisfies ResourceCreationResponse,
      { status: 400 },
    );
  }

  const protected_route = await withAdminApiRouteGuard(
    async (opts: IProtectedAdminApiRouteProps): Promise<NextResponse> =>
      await POST_resend_verification_handler(opts, target_uid),
  );
  return await protected_route(req);
}
