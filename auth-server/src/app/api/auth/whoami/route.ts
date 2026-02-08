import "server-only";

import { type NextRequest, NextResponse } from "next/server";
import { type IProtectedAuthenticatedApiRouteProps, withAuthenticatedApiRouteGuard } from "@/lib/withAuthenticatedRouteGuard";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const protected_route = await withAuthenticatedApiRouteGuard(
    async ({ user }: IProtectedAuthenticatedApiRouteProps): Promise<NextResponse> => {
      const debug: boolean = process.env.NODE_ENV === 'development';
      if (debug) {
        console.log(`[/api/auth/whoami] Returning user details for '${user.email}' (uid: '${user.uid}')`)
      }
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
