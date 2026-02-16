import { withAuthenticatedApiRouteGuard } from "@schemavaults/auth-server-sdk";
import { type NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const protected_route = withAuthenticatedApiRouteGuard(
    async () => {
      return NextResponse.json(
        {
          message: "Pong!",
          timestamp: Date.now(),
        },
        { status: 200 },
      );
    },
    {},
    "authenticated",
  );
  return await protected_route(req);
}
