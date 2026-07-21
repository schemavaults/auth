"use client";

import {
  useCallback,
  useRef,
  useTransition,
  type ChangeEvent,
  type ReactElement,
} from "react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Separator,
  cn,
  useToast,
} from "@schemavaults/ui";
import { Trash2, Upload } from "lucide-react";
import type { BrandingAssetMetadataRecord } from "@/lib/auth-db/branding/types";
import {
  buildBrandingAssetAcceptAttribute,
  resolveBrandingAssetUploadContentType,
} from "@/lib/auth-db/branding/branding-asset-keys";
import {
  useBrandingAssets,
  clearBrandingAssetsCache,
} from "./useBrandingAssets";

export interface BrandingAssetsCardProps {
  cardTitle?: string;
  cardDescription?: string;
  cardClassName?: string;
  preloaded?: readonly BrandingAssetMetadataRecord[];
}

function formatMaxSize(maxSizeBytes: number): string {
  if (maxSizeBytes >= 1024 * 1024) {
    return `${(maxSizeBytes / (1024 * 1024)).toFixed(maxSizeBytes % (1024 * 1024) === 0 ? 0 : 1)} MB`;
  }
  return `${Math.round(maxSizeBytes / 1024)} KB`;
}

/**
 * Cache-busted preview URL for a branding asset slot. The URL changes with
 * the uploaded content hash so the preview refreshes after upload/remove.
 */
function previewUrl(asset: BrandingAssetMetadataRecord): string {
  return `/branding/${asset.key}?preview=${asset.contentHash ?? "default"}`;
}

interface BrandingAssetRowProps {
  asset: BrandingAssetMetadataRecord;
  onUploadFile: (
    asset: BrandingAssetMetadataRecord,
    file: File,
  ) => Promise<void>;
  onRemove: (asset: BrandingAssetMetadataRecord) => Promise<void>;
}

function BrandingAssetRow({
  asset,
  onUploadFile,
  onRemove,
}: BrandingAssetRowProps): ReactElement {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // Async transition per row: isPending stays true until the upload/remove
  // action settles, disabling only this row's buttons, and clears itself —
  // no manual busy-state bookkeeping, and concurrent operations on other
  // rows are unaffected.
  const [isPending, startTransition] = useTransition();

  const handleFileChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>): void => {
      const file: File | undefined = e.target.files?.[0];
      // Reset so selecting the same file again still triggers onChange
      e.target.value = "";
      if (file) {
        startTransition(async () => {
          await onUploadFile(asset, file);
        });
      }
    },
    [asset, onUploadFile],
  );

  const handleRemoveClick = useCallback((): void => {
    startTransition(async () => {
      await onRemove(asset);
    });
  }, [asset, onRemove]);

  const isWide: boolean = asset.key === "opengraph-image";

  return (
    <div
      className="flex flex-col gap-4 sm:flex-row sm:items-center"
      data-testid={`branding-asset-row-${asset.key}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- runtime-uploaded asset served by /branding/*; dimensions unknown so next/image optimization does not apply */}
      <img
        src={previewUrl(asset)}
        alt={`${asset.label} preview`}
        className={cn(
          "shrink-0 rounded border bg-muted object-contain",
          isWide ? "h-16 w-[122px]" : "h-16 w-16",
        )}
      />
      <div className="flex min-w-0 grow flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="font-medium">{asset.label}</span>
          <Badge variant={asset.hasCustomAsset ? "default" : "secondary"}>
            {asset.hasCustomAsset ? "Custom" : "Default"}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">{asset.description}</p>
        <p className="text-xs text-muted-foreground">
          Recommended: {asset.recommendedDimensions} &middot; Max size:{" "}
          {formatMaxSize(asset.maxSizeBytes)}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept={buildBrandingAssetAcceptAttribute(asset.allowedContentTypes)}
          className="hidden"
          onChange={handleFileChange}
          data-testid={`branding-asset-file-input-${asset.key}`}
        />
        <Button
          variant="outline"
          size="sm"
          disabled={isPending}
          onClick={() => fileInputRef.current?.click()}
          data-testid={`branding-asset-upload-${asset.key}`}
        >
          <Upload className="mr-2 h-4 w-4" />
          {isPending ? "Working..." : "Upload"}
        </Button>
        {asset.hasCustomAsset ? (
          <Button
            variant="outline"
            size="sm"
            disabled={isPending}
            onClick={handleRemoveClick}
            data-testid={`branding-asset-remove-${asset.key}`}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Reset
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Admin settings card for customizing the white-label branding images
 * (favicon, app icon, opengraph image). Uploads replace the bundled or
 * generated defaults served by the public /branding/* routes.
 */
export function BrandingAssetsCard(
  props: BrandingAssetsCardProps,
): ReactElement {
  const cardTitle = props.cardTitle ?? "Branding Assets";
  const cardDescription =
    props.cardDescription ??
    "Customize the favicon, app icon, and social sharing image for this deployment.";
  const cardClassName: string = cn("w-full", props.cardClassName);

  const { toast } = useToast();
  const { data: assets, error } = useBrandingAssets({
    initialData: props.preloaded,
  });

  const handleUploadFile = useCallback(
    async (asset: BrandingAssetMetadataRecord, file: File): Promise<void> => {
      const contentType: string | null = resolveBrandingAssetUploadContentType(
        file,
        asset.allowedContentTypes,
      );
      if (!contentType) {
        toast({
          variant: "destructive",
          title: "Unsupported file type",
          description: `${asset.label} must be one of: ${asset.allowedContentTypes.join(", ")}`,
        });
        return;
      }
      if (file.size > asset.maxSizeBytes) {
        toast({
          variant: "destructive",
          title: "File too large",
          description: `${asset.label} uploads are limited to ${formatMaxSize(asset.maxSizeBytes)}`,
        });
        return;
      }

      try {
        const response = await fetch(`/api/admin/branding/${asset.key}`, {
          method: "PUT",
          credentials: "include",
          headers: {
            "Content-Type": contentType,
          },
          body: file,
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok || !body.success) {
          throw new Error(
            body.message ?? `Request failed with status ${response.status}`,
          );
        }
        toast({
          title: "Branding updated",
          description: `Successfully uploaded a new ${asset.label.toLowerCase()}`,
        });
        clearBrandingAssetsCache();
      } catch (e: unknown) {
        console.error(`Failed to upload branding asset "${asset.key}":`, e);
        toast({
          variant: "destructive",
          title: `Failed to upload ${asset.label.toLowerCase()}`,
          description:
            e instanceof Error ? e.message : "An unknown error occurred",
        });
      }
    },
    [toast],
  );

  const handleRemove = useCallback(
    async (asset: BrandingAssetMetadataRecord): Promise<void> => {
      try {
        const response = await fetch(`/api/admin/branding/${asset.key}`, {
          method: "DELETE",
          credentials: "include",
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok || !body.success) {
          throw new Error(
            body.message ?? `Request failed with status ${response.status}`,
          );
        }
        toast({
          title: "Branding reset",
          description: `${asset.label} reverted to the default`,
        });
        clearBrandingAssetsCache();
      } catch (e: unknown) {
        console.error(`Failed to remove branding asset "${asset.key}":`, e);
        toast({
          variant: "destructive",
          title: `Failed to reset ${asset.label.toLowerCase()}`,
          description:
            e instanceof Error ? e.message : "An unknown error occurred",
        });
      }
    },
    [toast],
  );

  return (
    <Card className={cardClassName} data-testid="branding-assets-card">
      <CardHeader>
        <CardTitle>{cardTitle}</CardTitle>
        <CardDescription>{cardDescription}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error ? (
          <p className="text-sm text-destructive">
            Failed to load branding assets: {error.message}
          </p>
        ) : null}
        {(assets ?? []).map((asset, index) => (
          <div key={asset.key} className="flex flex-col gap-4">
            {index > 0 ? <Separator /> : null}
            <BrandingAssetRow
              asset={asset}
              onUploadFile={handleUploadFile}
              onRemove={handleRemove}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export default BrandingAssetsCard;
