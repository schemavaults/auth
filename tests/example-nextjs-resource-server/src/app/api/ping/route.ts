import "server-only";
import { withAuthenticatedApiRouteGuard } from "@schemavaults/auth-server-sdk";
import { connection, type NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest): Promise<NextResponse> {
  await connection();
  const protected_route = withAuthenticatedApiRouteGuard(async () => {
    return NextResponse.json(
      {
        message: "Pong!",
        timestamp: Date.now(),
      },
      { status: 200 },
    );
  }, {});
  return await protected_route(req);
}

export const dynamic = "force-dynamic";
