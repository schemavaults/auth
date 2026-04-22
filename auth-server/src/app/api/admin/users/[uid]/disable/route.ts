import "server-only";

import {
  ServerlessDatabase,
  type ResourceCreationResponse,
  UserRegistry,
  UserNotFoundError,
} from "@/lib/auth-db";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  type IProtectedAdminApiRouteProps,
  withAdminApiRouteGuard,
} from "@/lib/withAdminRouteGuard";
import type { ServerRuntime } from "next";

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";

async function setDisabledHandler(
  { user, dbh }: IProtectedAdminApiRouteProps,
  target_uid: string,
  disabled: boolean,
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

  if (user.uid === target_uid) {
    return NextResponse.json(
      {
        success: false,
        message: "You cannot change your own disabled state.",
      } satisfies ResourceCreationResponse,
      { status: 400 },
    );
  }

  try {
    await new UserRegistry(dbh.db).setUserDisabled(target_uid, disabled);
  } catch (e: unknown) {
    if (e instanceof UserNotFoundError) {
      return NextResponse.json(
        {
          success: false,
          message: "User not found",
        } satisfies ResourceCreationResponse,
        { status: 404 },
      );
    }

    console.error(
      `Failed to set disabled=${disabled} for user '${target_uid}': `,
      e,
    );
    return NextResponse.json(
      {
        success: false,
        message: `Failed to ${disabled ? "disable" : "enable"} user`,
      } satisfies ResourceCreationResponse,
      { status: 500 },
    );
  }

  return NextResponse.json({
    success: true,
    message: `Successfully ${disabled ? "disabled" : "enabled"} user`,
    resource_id: target_uid,
  } satisfies ResourceCreationResponse);
}

async function parseTargetUid(
  props: { params: Promise<{ uid: string }> },
): Promise<{ ok: true; uid: string } | { ok: false; response: NextResponse }> {
  const params = await props.params;
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
    return { ok: true, uid: parsed.data };
  } catch (e: unknown) {
    console.error("Failed to parse target user ID: ", e);
    return {
      ok: false,
      response: NextResponse.json(
        {
          success: false,
          message: "Failed to parse target user ID",
        } satisfies ResourceCreationResponse,
        { status: 400 },
      ),
    };
  }
}

export async function POST(
  req: NextRequest,
  props: { params: Promise<{ uid: string }> },
): Promise<NextResponse> {
  const parsed = await parseTargetUid(props);
  if (!parsed.ok) return parsed.response;
  const target_uid = parsed.uid;

  const protected_route = await withAdminApiRouteGuard(
    async (opts: IProtectedAdminApiRouteProps): Promise<NextResponse> =>
      await setDisabledHandler(opts, target_uid, true),
  );
  return await protected_route(req);
}

export async function DELETE(
  req: NextRequest,
  props: { params: Promise<{ uid: string }> },
): Promise<NextResponse> {
  const parsed = await parseTargetUid(props);
  if (!parsed.ok) return parsed.response;
  const target_uid = parsed.uid;

  const protected_route = await withAdminApiRouteGuard(
    async (opts: IProtectedAdminApiRouteProps): Promise<NextResponse> =>
      await setDisabledHandler(opts, target_uid, false),
  );
  return await protected_route(req);
}
