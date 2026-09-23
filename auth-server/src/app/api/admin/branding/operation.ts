import { z, requireAuth } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { sessionSchemes } from "@/lib/api/auth-schemes";
import { BrandingAssetMetadataRecord } from "@/lib/api/domain-schemas/admin";
import { adminErrorResponses, ErrorResponse } from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import { BrandingAssetsRegistry, type BrandingAssetMetadataRecord as BrandingAssetMetadata } from "@/lib/auth-db/branding";
import captureServerException from "@/lib/captureServerException";

const ROUTE = "/api/admin/branding";

export const listBrandingAssets = defineOperation({
  method: "get",
  path: ROUTE,
  summary: "List branding asset slots",
  description:
    "Lists every white-label branding asset slot (favicon, app icon, ...) with its upload constraints and, when an administrator uploaded a custom asset, its metadata. The assets themselves are served publicly at `/branding/{asset}`.",
  tags: [API_TAGS.admin],
  auth: requireAuth({ schemes: sessionSchemes, routeGuard: "admin" }),
  responses: {
    200: {
      description: "Every branding asset slot",
      schema: z.object({
        success: z.literal(true),
        data: z.object({ assets: z.array(BrandingAssetMetadataRecord).readonly() }),
      }),
    },
    ...adminErrorResponses,
    500: { description: "Failed to list branding assets", schema: ErrorResponse },
  },
  handler: async (ctx) => {
    const user = ctx.auth.user!;
    const { db, redis } = ctx.context;

    let assets: BrandingAssetMetadata[];
    try {
      const registry = new BrandingAssetsRegistry(db, undefined, redis.client);
      assets = await registry.listAssetMetadata();
    } catch (e: unknown) {
      await captureServerException(db, e, {
        op_name: "GET_list_branding_assets.listAssetMetadata",
        route: ROUTE,
        uid: user.uid,
      });
      return ctx.json(500, { success: false, message: "Failed to list branding assets" });
    }

    return ctx.json(200, { success: true, data: { assets } });
  },
});
