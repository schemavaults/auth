import "server-only";
import { withAdminApiRouteGuard } from "@/lib/withAdminRouteGuard";
import type { ServerRuntime } from "next";
import { type NextRequest, NextResponse } from "next/server";
import type { IProtectedAdminApiRouteProps } from "@/lib/withAdminRouteGuard";
import {
  BrandingAssetsRegistry,
  BrandingAssetInvalidContentTypeError,
  BrandingAssetTooLargeError,
  isValidBrandingAssetKey,
  getBrandingAssetDefinition,
  type BrandingAssetKey,
} from "@/lib/auth-db/branding";
import captureServerException from "@/lib/captureServerException";

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";

async function PUT_upload_branding_asset(
  { user, dbh, redis }: IProtectedAdminApiRouteProps,
  key: BrandingAssetKey,
  bytes: Uint8Array,
  contentType: string,
): Promise<NextResponse> {
  if (!user.admin) {
    return NextResponse.json(
      {
        success: false,
        message: "Admin access required",
      },
      { status: 403 },
    );
  }

  try {
    const registry = new BrandingAssetsRegistry(
      dbh.db,
      undefined,
      redis?.client,
    );
    const stored = await registry.setAsset(key, bytes, contentType, user.uid);
    return NextResponse.json(
      {
        success: true,
        data: {
          key,
          contentType: stored.contentType,
          contentHash: stored.contentHash,
          sizeBytes: stored.sizeBytes,
          updatedAt: stored.updatedAt,
        },
      },
      { status: 200 },
    );
  } catch (e: unknown) {
    if (
      e instanceof BrandingAssetInvalidContentTypeError ||
      e instanceof BrandingAssetTooLargeError
    ) {
      return NextResponse.json(
        {
          success: false,
          message: e.message,
        },
        { status: 400 },
      );
    }
    await captureServerException(dbh.db, e, {
      op_name: "PUT_upload_branding_asset.setAsset",
      route: "/api/admin/branding/[asset]",
      uid: user.uid,
      context: { key },
    });
    return NextResponse.json(
      {
        success: false,
        message: `Failed to upload branding asset "${key}"`,
      },
      { status: 500 },
    );
  }
}

async function DELETE_remove_branding_asset(
  { user, dbh, redis }: IProtectedAdminApiRouteProps,
  key: BrandingAssetKey,
): Promise<NextResponse> {
  if (!user.admin) {
    return NextResponse.json(
      {
        success: false,
        message: "Admin access required",
      },
      { status: 403 },
    );
  }

  try {
    const registry = new BrandingAssetsRegistry(
      dbh.db,
      undefined,
      redis?.client,
    );
    await registry.deleteAsset(key);
  } catch (e: unknown) {
    await captureServerException(dbh.db, e, {
      op_name: "DELETE_remove_branding_asset.deleteAsset",
      route: "/api/admin/branding/[asset]",
      uid: user.uid,
      context: { key },
    });
    return NextResponse.json(
      {
        success: false,
        message: `Failed to remove branding asset "${key}"`,
      },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      success: true,
      data: {
        key,
      },
    },
    { status: 200 },
  );
}

/**
 * Upload a branding asset. The request body is the raw image bytes and the
 * Content-Type header must be one of the asset's allowed MIME types.
 */
export async function PUT(
  req: NextRequest,
  context: RouteContext<"/api/admin/branding/[asset]">,
): Promise<NextResponse> {
  const protected_route = await withAdminApiRouteGuard(async (props) => {
    const { asset } = await context.params;
    if (!isValidBrandingAssetKey(asset)) {
      return NextResponse.json(
        {
          success: false,
          message: `Invalid branding asset key: ${asset}`,
        },
        { status: 400 },
      );
    }

    const contentType: string | null = req.headers.get("content-type");
    if (!contentType) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Missing Content-Type header; it must be set to the image's MIME type",
        },
        { status: 400 },
      );
    }

    // Reject oversized uploads from the declared length before buffering the
    // body; setAsset() re-checks the actual byte length after reading.
    const definition = getBrandingAssetDefinition(asset);
    const declaredLength: number = parseInt(
      req.headers.get("content-length") ?? "0",
    );
    if (
      Number.isFinite(declaredLength) &&
      declaredLength > definition.maxSizeBytes
    ) {
      return NextResponse.json(
        {
          success: false,
          message: `Branding asset "${asset}" uploads are limited to ${definition.maxSizeBytes} bytes`,
        },
        { status: 413 },
      );
    }

    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await req.arrayBuffer());
    } catch {
      return NextResponse.json(
        {
          success: false,
          message: "Failed to read request body",
        },
        { status: 400 },
      );
    }

    return PUT_upload_branding_asset(props, asset, bytes, contentType);
  });
  return await protected_route(req);
}

/**
 * Remove a custom branding asset, reverting the slot to its default.
 */
export async function DELETE(
  req: NextRequest,
  context: RouteContext<"/api/admin/branding/[asset]">,
): Promise<NextResponse> {
  const protected_route = await withAdminApiRouteGuard(async (props) => {
    const { asset } = await context.params;
    if (!isValidBrandingAssetKey(asset)) {
      return NextResponse.json(
        {
          success: false,
          message: `Invalid branding asset key: ${asset}`,
        },
        { status: 400 },
      );
    }
    return DELETE_remove_branding_asset(props, asset);
  });
  return await protected_route(req);
}
