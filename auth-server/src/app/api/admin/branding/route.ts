import "server-only";
import { withAdminApiRouteGuard } from "@/lib/withAdminRouteGuard";
import type { ServerRuntime } from "next";
import { type NextRequest, NextResponse } from "next/server";
import type { IProtectedAdminApiRouteProps } from "@/lib/withAdminRouteGuard";
import { BrandingAssetsRegistry } from "@/lib/auth-db/branding";
import type { BrandingAssetMetadataRecord } from "@/lib/auth-db/branding";
import captureServerException from "@/lib/captureServerException";

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";

async function GET_list_branding_assets({
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
      { status: 403 },
    );
  }

  let assets: BrandingAssetMetadataRecord[];
  try {
    const registry = new BrandingAssetsRegistry(
      dbh.db,
      undefined,
      redis?.client,
    );
    assets = await registry.listAssetMetadata();
  } catch (e: unknown) {
    await captureServerException(dbh.db, e, {
      op_name: "GET_list_branding_assets.listAssetMetadata",
      route: "/api/admin/branding",
      uid: user.uid,
    });
    return NextResponse.json(
      {
        success: false,
        message: "Failed to list branding assets",
      },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      success: true,
      data: {
        assets,
      },
    },
    { status: 200 },
  );
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const protected_route = await withAdminApiRouteGuard(
    GET_list_branding_assets,
  );
  return await protected_route(req);
}
