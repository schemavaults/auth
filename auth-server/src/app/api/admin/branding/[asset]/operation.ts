import { z, requireAuth } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { sessionSchemes } from "@/lib/api/auth-schemes";
import { brandingAssetKeySchema, BrandingAssetUploadResult } from "@/lib/api/domain-schemas/admin";
import { adminErrorResponses, ErrorResponse, validationErrorResponse } from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import {
  BrandingAssetsRegistry,
  BrandingAssetInvalidContentTypeError,
  BrandingAssetTooLargeError,
  getBrandingAssetDefinition,
} from "@/lib/auth-db/branding";
import captureServerException from "@/lib/captureServerException";

const ROUTE = "/api/admin/branding/{asset}";

const params = z.object({ asset: brandingAssetKeySchema });

export const uploadBrandingAsset = defineOperation({
  method: "put",
  path: ROUTE,
  summary: "Upload a branding asset",
  description:
    "Replaces the image of one branding asset slot. The request body is the raw image bytes and the `Content-Type` header must be one of the slot's allowed MIME types (see `GET /api/admin/branding`); uploads above the slot's size limit are refused. The new asset is served immediately at `/branding/{asset}`.",
  tags: [API_TAGS.admin],
  auth: requireAuth({ schemes: sessionSchemes, routeGuard: "admin" }),
  request: {
    params,
    body: {
      contentType: "application/octet-stream",
      schema: z.string().openapi({
        format: "binary",
        description: "Raw image bytes; send the image's own MIME type as the request Content-Type",
      }),
      documentOnly: true,
      description:
        "The raw image bytes. Accepted image types depend on the slot (e.g. image/png, image/svg+xml, image/x-icon for the favicon); the request `Content-Type` header must name the image's MIME type.",
    },
  },
  responses: {
    200: {
      description: "The asset was stored",
      schema: z.object({ success: z.literal(true), data: BrandingAssetUploadResult }),
    },
    ...validationErrorResponse,
    ...adminErrorResponses,
    413: { description: "The declared Content-Length exceeds the slot's size limit", schema: ErrorResponse },
    500: { description: "Failed to store the asset", schema: ErrorResponse },
  },
  handler: async (ctx) => {
    const user = ctx.auth.user!;
    const { db, redis } = ctx.context;
    const { asset } = ctx.params;
    const req = ctx.request;

    const contentType: string | null = req.headers.get("content-type");
    if (!contentType) {
      return ctx.json(400, {
        success: false,
        message: "Missing Content-Type header; it must be set to the image's MIME type",
      });
    }

    // Reject oversized uploads from the declared length before buffering the
    // body; setAsset() re-checks the actual byte length after reading.
    const definition = getBrandingAssetDefinition(asset);
    const declaredLength: number = parseInt(req.headers.get("content-length") ?? "0");
    if (Number.isFinite(declaredLength) && declaredLength > definition.maxSizeBytes) {
      return ctx.json(413, {
        success: false,
        message: `Branding asset "${asset}" uploads are limited to ${definition.maxSizeBytes} bytes`,
      });
    }

    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await req.arrayBuffer());
    } catch {
      return ctx.json(400, { success: false, message: "Failed to read request body" });
    }

    try {
      const registry = new BrandingAssetsRegistry(db, undefined, redis.client);
      const stored = await registry.setAsset(asset, bytes, contentType, user.uid);
      return ctx.json(200, {
        success: true,
        data: {
          key: asset,
          contentType: stored.contentType,
          contentHash: stored.contentHash,
          sizeBytes: stored.sizeBytes,
          updatedAt: stored.updatedAt,
        },
      });
    } catch (e: unknown) {
      if (e instanceof BrandingAssetInvalidContentTypeError || e instanceof BrandingAssetTooLargeError) {
        return ctx.json(400, { success: false, message: e.message });
      }
      await captureServerException(db, e, {
        op_name: "PUT_upload_branding_asset.setAsset",
        route: "/api/admin/branding/[asset]",
        uid: user.uid,
        context: { key: asset },
      });
      return ctx.json(500, { success: false, message: `Failed to upload branding asset "${asset}"` });
    }
  },
});

export const removeBrandingAsset = defineOperation({
  method: "delete",
  path: ROUTE,
  summary: "Remove a custom branding asset",
  description: "Deletes the uploaded image of one branding asset slot so the deployment's default is served again.",
  tags: [API_TAGS.admin],
  auth: requireAuth({ schemes: sessionSchemes, routeGuard: "admin" }),
  request: { params },
  responses: {
    200: {
      description: "The slot was reverted to its default",
      schema: z.object({ success: z.literal(true), data: z.object({ key: z.string() }) }),
    },
    ...validationErrorResponse,
    ...adminErrorResponses,
    500: { description: "Failed to remove the asset", schema: ErrorResponse },
  },
  handler: async (ctx) => {
    const user = ctx.auth.user!;
    const { db, redis } = ctx.context;
    const { asset } = ctx.params;

    try {
      const registry = new BrandingAssetsRegistry(db, undefined, redis.client);
      await registry.deleteAsset(asset);
    } catch (e: unknown) {
      await captureServerException(db, e, {
        op_name: "DELETE_remove_branding_asset.deleteAsset",
        route: "/api/admin/branding/[asset]",
        uid: user.uid,
        context: { key: asset },
      });
      return ctx.json(500, { success: false, message: `Failed to remove branding asset "${asset}"` });
    }

    return ctx.json(200, { success: true, data: { key: asset } });
  },
});
