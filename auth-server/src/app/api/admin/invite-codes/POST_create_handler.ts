import "server-only";

import {
  type ResourceCreationResponse,
  UserRegistry,
} from "@/lib/auth-db";
import {
  inviteCodeDefinitionSchema,
  type InviteCodeDefinition,
} from "@schemavaults/auth-common";
import { NextResponse } from "next/server";
import type { IProtectedAdminApiRouteProps } from "@/lib/withAdminRouteGuard";

export default async function POST_create_handler(
  { req, dbh, user }: IProtectedAdminApiRouteProps
): Promise<NextResponse> {
  if (!user.admin) {
    return NextResponse.json(
      {
        success: false,
        message: "You must be an admin to use this resource!",
      } satisfies ResourceCreationResponse,
      {
        status: 403,
      },
    );
  }

  let new_invite_code: InviteCodeDefinition;
  try {
    const body: unknown = await req.json();
    if (typeof body !== "object" || !body) {
      throw new Error("Request body was not JSON object!");
    }
    const parsed = await inviteCodeDefinitionSchema.safeParseAsync(body);
    if (!parsed.success) {
      throw parsed.error;
    }

    const thirtySecondsInMs = 30000 as const satisfies number;
    const maxAgeMs: number = thirtySecondsInMs;
    if (Math.abs(parsed.data.created_at - Date.now()) > maxAgeMs) {
      return NextResponse.json(
        {
          success: false,
          message:
            `Invite code definition 'created_at' too far in the past (over ${maxAgeMs / 1000}s)!`,
        } satisfies ResourceCreationResponse,
        {
          status: 412,
        },
      );
    }

    new_invite_code = parsed.data satisfies InviteCodeDefinition;
  } catch (e: unknown) {
    console.error(
      "Failed to parse invite code definition from request body: ",
      e,
    );
    return NextResponse.json(
      {
        success: false,
        message: "Failed to parse invite code definition from request body!",
      } satisfies ResourceCreationResponse,
      {
        status: 400,
      },
    );
  }

  new_invite_code['created_by'] = user.uid;

  try {
    const registry = new UserRegistry(dbh.db);

    await registry.createInviteCode(new_invite_code);

    return NextResponse.json({
      success: true,
      message: "Successfully inserted invite code into database!",
      resource_id: new_invite_code.invite_code,
    } satisfies ResourceCreationResponse);
  } catch (e: unknown) {
    console.error("Failed to insert invite code into database: ", e);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to insert invite code into database",
      } satisfies ResourceCreationResponse,
      {
        status: 500,
      },
    );
  }
}
