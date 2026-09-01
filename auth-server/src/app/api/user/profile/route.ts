import "server-only";
import { type NextRequest, NextResponse } from "next/server";
import type { ServerRuntime } from "next";
import {
  updateUserProfileRequestSchema,
  userProfileResponseSchema,
  type UserProfileNames,
  type UserProfileResponse,
} from "@schemavaults/auth-common";
import {
  type IProtectedAuthenticatedApiRouteProps,
  withAuthenticatedApiRouteGuard,
} from "@/lib/withAuthenticatedRouteGuard";
import {
  UserRegistry,
  UsernameTakenError,
  UserNotFoundError,
  type UserDocument,
} from "@/lib/auth-db";
import captureServerException from "@/lib/captureServerException";

const ROUTE = "/api/user/profile";

function toProfileNames(user: UserDocument): UserProfileNames {
  return {
    ...(user.username !== undefined ? { username: user.username } : {}),
    ...(user.first_name !== undefined ? { first_name: user.first_name } : {}),
    ...(user.middle_name !== undefined
      ? { middle_name: user.middle_name }
      : {}),
    ...(user.last_name !== undefined ? { last_name: user.last_name } : {}),
    ...(user.display_name !== undefined
      ? { display_name: user.display_name }
      : {}),
  };
}

function profileResponse(user: UserDocument): NextResponse {
  const payload: UserProfileResponse = {
    success: true,
    profile: toProfileNames(user),
  };
  const parsed = userProfileResponseSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: "Failed to serialize user profile" },
      { status: 500 },
    );
  }
  return NextResponse.json(parsed.data, { status: 200 });
}

/**
 * GET /api/user/profile — returns the current user's profile name
 * fields, read fresh from the database (the auth token payload does not
 * carry them).
 */
async function GET_profile_handler({
  user,
  dbh,
}: IProtectedAuthenticatedApiRouteProps): Promise<NextResponse> {
  try {
    const registry = new UserRegistry(dbh.db);
    const userDoc = await registry.getUserByUID(user.uid);
    if (!userDoc) {
      return NextResponse.json(
        { success: false, message: "User not found" },
        { status: 404 },
      );
    }
    return profileResponse(userDoc);
  } catch (e: unknown) {
    await captureServerException(dbh.db, e, {
      op_name: "GET_profile_handler",
      route: ROUTE,
      uid: user.uid,
    });
    return NextResponse.json(
      { success: false, message: "Failed to load user profile" },
      { status: 500 },
    );
  }
}

/**
 * PUT /api/user/profile — replaces the current user's profile name
 * fields. Full-replacement semantics: omitted or null fields are
 * cleared. Returns 409 when the requested username is already taken.
 */
async function PUT_profile_handler({
  user,
  dbh,
  req,
}: IProtectedAuthenticatedApiRouteProps): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, message: "Request body must be JSON" },
      { status: 400 },
    );
  }

  const parsedBody = await updateUserProfileRequestSchema.safeParseAsync(body);
  if (!parsedBody.success) {
    return NextResponse.json(
      {
        success: false,
        message: "Invalid profile fields",
        issues: parsedBody.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      { status: 400 },
    );
  }

  try {
    const registry = new UserRegistry(dbh.db);
    const updated = await registry.updateUserProfile(
      user.uid,
      parsedBody.data,
    );
    return profileResponse(updated);
  } catch (e: unknown) {
    if (e instanceof UsernameTakenError) {
      return NextResponse.json(
        { success: false, message: "That username is already taken." },
        { status: 409 },
      );
    }
    if (e instanceof UserNotFoundError) {
      return NextResponse.json(
        { success: false, message: "User not found" },
        { status: 404 },
      );
    }
    await captureServerException(dbh.db, e, {
      op_name: "PUT_profile_handler",
      route: ROUTE,
      uid: user.uid,
    });
    return NextResponse.json(
      { success: false, message: "Failed to update user profile" },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  return await (await withAuthenticatedApiRouteGuard(GET_profile_handler))(
    req,
  );
}

export async function PUT(req: NextRequest): Promise<NextResponse> {
  return await (await withAuthenticatedApiRouteGuard(PUT_profile_handler))(
    req,
  );
}

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
