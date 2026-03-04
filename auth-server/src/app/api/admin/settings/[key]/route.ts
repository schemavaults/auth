import "server-only";
import { withAdminApiRouteGuard } from "@/lib/withAdminRouteGuard";
import type { ServerRuntime } from "next";
import { type NextRequest, NextResponse } from "next/server";
import type { IProtectedAdminApiRouteProps } from "@/lib/withAdminRouteGuard";
import {
  ServerSettingsRegistry,
  isValidServerSettingKey,
  getSettingSchema,
  type ServerSettingKey,
} from "@/lib/auth-db/server-settings";

export const runtime: ServerRuntime = "edge";
export const dynamic = "force-dynamic";

interface PatchSettingRequestBody {
  value: unknown;
  description?: string;
}

async function PATCH_update_setting(
  { user, dbh }: IProtectedAdminApiRouteProps,
  key: string,
  body: PatchSettingRequestBody
): Promise<NextResponse> {
  if (!user.admin) {
    return NextResponse.json(
      {
        success: false,
        message: "Admin access required",
      },
      { status: 403 }
    );
  }

  if (!isValidServerSettingKey(key)) {
    return NextResponse.json(
      {
        success: false,
        message: `Invalid setting key: ${key}`,
      },
      { status: 400 }
    );
  }

  const typedKey = key as ServerSettingKey;
  const schema = getSettingSchema(typedKey);
  const parseResult = schema.safeParse(body.value);

  if (!parseResult.success) {
    return NextResponse.json(
      {
        success: false,
        message: `Invalid value for setting "${key}": ${parseResult.error.message}`,
      },
      { status: 400 }
    );
  }

  try {
    const registry = new ServerSettingsRegistry(dbh.db);
    await registry.setSetting(
      typedKey,
      parseResult.data,
      user.uid,
      body.description
    );
  } catch (e: unknown) {
    console.error(`Failed to update setting "${key}":`, e);
    return NextResponse.json(
      {
        success: false,
        message: `Failed to update setting "${key}"`,
      },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      success: true,
      data: {
        key,
        value: parseResult.data,
      },
    },
    { status: 200 }
  );
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> }
): Promise<NextResponse> {
  const protected_route = await withAdminApiRouteGuard(async (props) => {
    const { key } = await params;

    let body: PatchSettingRequestBody;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid JSON body",
        },
        { status: 400 }
      );
    }

    if (typeof body.value === "undefined") {
      return NextResponse.json(
        {
          success: false,
          message: "Missing 'value' field in request body",
        },
        { status: 400 }
      );
    }

    return PATCH_update_setting(props, key, body);
  });
  return await protected_route(req);
}
