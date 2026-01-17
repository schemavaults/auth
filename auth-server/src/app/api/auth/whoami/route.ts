import "server-only";

import { NextResponse } from "next/server";
import { withAuthenticatedApiRouteGuard } from "@/lib/withAuthenticatedRouteGuard";

export const GET = withAuthenticatedApiRouteGuard(async ({ user }) => {
  return NextResponse.json(
    {
      success: true,
      user: user,
    },
    {
      status: 200,
    },
  );
});
