import "server-only";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  type IProtectedAdminApiRouteProps,
  withAdminApiRouteGuard,
} from "@/lib/withAdminRouteGuard";
import type { ServerRuntime } from "next";
import {
  type IssuedTokenRow,
  type IssuedTokenType,
  listIssuedTokensForUser,
} from "@/lib/auth-db/issued-tokens";
import type { ResourceCreationResponse } from "@/lib/auth-db";
import captureServerException from "@/lib/captureServerException";

export const dynamic = "force-dynamic";
export const runtime: ServerRuntime = "nodejs";

const ROUTE = "/api/admin/users/[uid]/tokens";

const tokenTypeSchema = z.enum(["access", "refresh"]);

async function GET_list_user_tokens_handler(
  { user, dbh }: IProtectedAdminApiRouteProps,
  target_uid: string,
  token_type: IssuedTokenType | undefined,
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

  let tokens: readonly IssuedTokenRow[];
  try {
    tokens = await listIssuedTokensForUser(dbh.db, target_uid, {
      token_type,
    });
  } catch (e: unknown) {
    await captureServerException(dbh.db, e, {
      op_name: "GET_list_user_tokens_handler.listIssuedTokensForUser",
      route: ROUTE,
      uid: user.uid,
      context: { target_uid, token_type },
    });
    return NextResponse.json(
      {
        success: false,
        message: "Failed to list user tokens!",
      } satisfies ResourceCreationResponse,
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      success: true,
      message: "Successfully listed user tokens!",
      data: { tokens },
    },
    { status: 200 },
  );
}

export async function GET(
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
    console.error("[admin/users/tokens] Failed to parse target user ID:", e);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to parse target user ID",
      } satisfies ResourceCreationResponse,
      { status: 400 },
    );
  }

  let token_type: IssuedTokenType | undefined;
  const rawType = req.nextUrl.searchParams.get("token_type");
  if (rawType !== null) {
    const parsedType = tokenTypeSchema.safeParse(rawType);
    if (!parsedType.success) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid token_type query parameter",
        } satisfies ResourceCreationResponse,
        { status: 400 },
      );
    }
    token_type = parsedType.data;
  }

  const protected_route = await withAdminApiRouteGuard(
    async (opts: IProtectedAdminApiRouteProps): Promise<NextResponse> =>
      await GET_list_user_tokens_handler(opts, target_uid, token_type),
  );
  return await protected_route(req);
}
