import "server-only";
import { withAdminApiRouteGuard } from "@/lib/withAdminRouteGuard";
import type { ServerRuntime } from "next";
import { type NextRequest, NextResponse } from "next/server";
import type { IProtectedAdminApiRouteProps } from "@/lib/withAdminRouteGuard";
import { ServerSettingsRegistry } from "@/lib/auth-db/server-settings";
import type { ServerSettingRecord } from "@/lib/auth-db/server-settings";

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";

async function GET_list_settings({
  user,
  dbh,
  redis,
}: IProtectedAdminApiRouteProps): Promise<NextResponse> {
  if (!user.admin) {
    return NextResponse.json(
      {
        success: false,
        message: "Admin access required",
      },
      { status: 403 }
    );
  }

  let settings: ServerSettingRecord[];
  try {
    const registry = new ServerSettingsRegistry(dbh.db, undefined, redis?.client);
    settings = await registry.listAllSettings();
  } catch (e: unknown) {
    console.error("Failed to list server settings:", e);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to list server settings",
      },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      success: true,
      data: {
        settings,
      },
    },
    { status: 200 }
  );
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const protected_route = await withAdminApiRouteGuard(GET_list_settings);
  return await protected_route(req);
}
