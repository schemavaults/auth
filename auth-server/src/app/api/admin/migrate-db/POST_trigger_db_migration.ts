import "server-only";

import type {
  ResourceCreationResponse,
} from "@/lib/auth-db";
import { type NextRequest, NextResponse } from "next/server";
import { type IProtectedAdminApiRouteProps, withAdminApiRouteGuard } from "@/lib/withAdminRouteGuard";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import migrateToLatest from "@/lib/auth-db/migrate-to-latest";



async function POST_handler({ req, dbh, user }: IProtectedAdminApiRouteProps<AuthDatabase>): Promise<NextResponse> {
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

  try {
    await migrateToLatest(dbh.db);
  } catch (e: unknown) {
    console.error(
      "Error attempting to initialize @schemavaults/auth-server postgres database: ",
      e,
    );
    return NextResponse.json(
      {
        success: false,
        message:
          "Error attempting to initialize @schemavaults/auth-server postgres database!",
      } satisfies ResourceCreationResponse,
      {
        status: 500,
      },
    );
  }

  return NextResponse.json(
    {
      success: true,
      message: "Initialized @schemavaults/auth-server postgres database!",
    },
    {
      status: 200,
    },
  );
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const protected_route = await withAdminApiRouteGuard(POST_handler);
  return await protected_route(req);
}
