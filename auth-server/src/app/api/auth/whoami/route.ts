import "server-only";

import { type NextRequest, NextResponse } from "next/server";
import { type IProtectedAuthenticatedApiRouteProps, withAuthenticatedApiRouteGuard } from "@/lib/withAuthenticatedRouteGuard";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const protected_route = await withAuthenticatedApiRouteGuard(
    async ({ user }: IProtectedAuthenticatedApiRouteProps): Promise<NextResponse> => {
      return NextResponse.json(
        {
          success: true,
          user: user,
        },
        {
          status: 200,
        },
      );
    }
  );
  return await protected_route(req);
}
