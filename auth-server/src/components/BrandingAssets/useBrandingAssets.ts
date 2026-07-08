"use client";

import useSWR, { type SWRResponse, mutate } from "swr";
import type { BrandingAssetMetadataRecord } from "@/lib/auth-db/branding/types";
import { z } from "zod";

const brandingAssetMetadataRecordSchema = z.object({
  key: z.string(),
  label: z.string(),
  description: z.string(),
  allowedContentTypes: z.array(z.string()),
  maxSizeBytes: z.number(),
  recommendedDimensions: z.string(),
  hasCustomAsset: z.boolean(),
  contentType: z.string().nullable(),
  contentHash: z.string().nullable(),
  sizeBytes: z.number().nullable(),
  updatedAt: z.number().nullable(),
  updatedBy: z.string().nullable(),
});

const ENDPOINT = "/api/admin/branding";

export interface UseBrandingAssetsOptions {
  initialData?: readonly BrandingAssetMetadataRecord[];
}

export function useBrandingAssets(
  options?: UseBrandingAssetsOptions,
): SWRResponse<readonly BrandingAssetMetadataRecord[], Error> {
  return useSWR<readonly BrandingAssetMetadataRecord[], Error>(
    ENDPOINT,
    async (): Promise<readonly BrandingAssetMetadataRecord[]> => {
      const response = await fetch(ENDPOINT, {
        method: "GET",
        credentials: "include",
      });

      if (!response.ok || response.status !== 200) {
        throw new Error(
          `Failed to list branding assets (status: ${response.status})`,
        );
      }

      const body: unknown = await response.json();
      if (
        typeof body !== "object" ||
        !body ||
        !("success" in body) ||
        !body.success
      ) {
        throw new Error(
          "Received failure response when attempting to list branding assets",
        );
      }

      if (
        !("data" in body) ||
        typeof body.data !== "object" ||
        !body.data ||
        !("assets" in body.data) ||
        !Array.isArray(body.data.assets)
      ) {
        throw new Error("Failed to extract 'assets' array from response");
      }

      const parsed = z
        .array(brandingAssetMetadataRecordSchema)
        .safeParse(body.data.assets);
      if (!parsed.success) {
        console.error("Failed to parse branding assets:", parsed.error);
        throw new Error("Failed to parse branding assets from response");
      }

      return parsed.data;
    },
    {
      fallbackData: options?.initialData,
    },
  );
}

export function clearBrandingAssetsCache(): void {
  mutate(
    (key): boolean =>
      typeof key === "string" && key.startsWith("/api/admin/branding"),
    undefined,
    { revalidate: true },
  );
}
