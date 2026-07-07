import "server-only";

import { createHash } from "node:crypto";
import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import type Redis from "ioredis";
import type { ServerBrandingAssetRow } from "./branding-assets-table";
import type {
  BrandingAssetContent,
  BrandingAssetMetadataRecord,
} from "./types";
import {
  type BrandingAssetKey,
  BRANDING_ASSET_DEFINITIONS,
  getAllBrandingAssetKeys,
  getBrandingAssetDefinition,
} from "./branding-asset-keys";

/**
 * Redis payload for a cached branding asset. A `miss: true` sentinel is
 * cached for slots with no custom asset so that hot routes (e.g. the favicon)
 * don't query the database on every request just to fall back to the default.
 */
interface RedisAssetCachePayload {
  miss?: true;
  /** base64-encoded image bytes */
  b?: string;
  /** content type */
  t?: string;
  /** SHA-256 hex digest of the raw bytes */
  h?: string;
  /** raw size in bytes */
  s?: number;
  /** updated_at timestamp (ms) */
  u?: number;
}

export class BrandingAssetTooLargeError extends Error {
  constructor(key: BrandingAssetKey, sizeBytes: number, maxSizeBytes: number) {
    super(
      `Branding asset "${key}" is ${sizeBytes} bytes, which exceeds the maximum of ${maxSizeBytes} bytes`,
    );
    this.name = "BrandingAssetTooLargeError";
  }
}

export class BrandingAssetInvalidContentTypeError extends Error {
  constructor(key: BrandingAssetKey, contentType: string) {
    super(
      `Content type "${contentType}" is not allowed for branding asset "${key}". Allowed: ${BRANDING_ASSET_DEFINITIONS[
        key
      ].allowedContentTypes.join(", ")}`,
    );
    this.name = "BrandingAssetInvalidContentTypeError";
  }
}

/**
 * Registry for managing white-label branding assets (favicon, app icon,
 * opengraph image) in the database. Reads are cached in Redis so the public
 * /branding/* routes and generateMetadata() stay cheap under load.
 */
export class BrandingAssetsRegistry {
  private readonly cacheTtlMs: number;

  constructor(
    private readonly db: Kysely<AuthDatabase>,
    cacheTtlMs: number = 60_000, // 1 minute default
    private readonly redis?: Redis,
  ) {
    this.cacheTtlMs = cacheTtlMs;
  }

  private redisKey(key: string): string {
    return `branding_asset:${key}`;
  }

  private get redisVersionsKey(): string {
    return "branding_asset_versions";
  }

  private get redisTtlSeconds(): number {
    return Math.ceil(this.cacheTtlMs / 1000);
  }

  private rowToContent(row: ServerBrandingAssetRow): BrandingAssetContent {
    return {
      key: row.asset_key,
      contentBase64: row.content_base64,
      contentType: row.content_type,
      contentHash: row.content_hash,
      sizeBytes: row.size_bytes,
      updatedAt:
        typeof row.updated_at === "number"
          ? row.updated_at
          : parseInt(row.updated_at),
    };
  }

  /**
   * Load a branding asset's content, checking the Redis cache first.
   * Returns null when no custom asset has been uploaded for the slot.
   */
  public async getAsset(
    key: BrandingAssetKey,
  ): Promise<BrandingAssetContent | null> {
    if (this.redis) {
      try {
        const cached = await this.redis.get(this.redisKey(key));
        if (cached !== null) {
          const payload: RedisAssetCachePayload = JSON.parse(cached);
          if (payload.miss) {
            return null;
          }
          if (
            typeof payload.b === "string" &&
            typeof payload.t === "string" &&
            typeof payload.h === "string"
          ) {
            return {
              key,
              contentBase64: payload.b,
              contentType: payload.t,
              contentHash: payload.h,
              sizeBytes: payload.s ?? 0,
              updatedAt: payload.u ?? 0,
            };
          }
        }
      } catch (e: unknown) {
        console.error(
          `[BrandingAssetsRegistry] Redis cache read failed for "${key}", falling back to database:`,
          e,
        );
      }
    }

    let row: ServerBrandingAssetRow | undefined;
    try {
      row = await this.db
        .selectFrom("server_branding_assets")
        .where("asset_key", "=", key)
        .selectAll()
        .executeTakeFirst();
    } catch (e: unknown) {
      console.error(
        `[BrandingAssetsRegistry] Failed to query asset "${key}":`,
        e,
      );
      throw new Error(
        `Error attempting to query branding asset with key '${key}'`,
      );
    }

    const content: BrandingAssetContent | null = row
      ? this.rowToContent(row)
      : null;

    if (this.redis) {
      try {
        const payload: RedisAssetCachePayload = content
          ? {
              b: content.contentBase64,
              t: content.contentType,
              h: content.contentHash,
              s: content.sizeBytes,
              u: content.updatedAt,
            }
          : { miss: true };
        await this.redis.set(
          this.redisKey(key),
          JSON.stringify(payload),
          "EX",
          this.redisTtlSeconds,
        );
      } catch (e: unknown) {
        console.error(
          `[BrandingAssetsRegistry] Failed to populate Redis cache for "${key}":`,
          e,
        );
      }
    }

    return content;
  }

  /**
   * Store (create or replace) a branding asset after validating its content
   * type and size against the slot's definition.
   */
  public async setAsset(
    key: BrandingAssetKey,
    bytes: Uint8Array,
    contentType: string,
    updatedBy?: string,
  ): Promise<BrandingAssetContent> {
    const definition = getBrandingAssetDefinition(key);

    const normalizedContentType = (contentType.split(";")[0] ?? contentType)
      .trim()
      .toLowerCase();
    if (!definition.allowedContentTypes.includes(normalizedContentType)) {
      throw new BrandingAssetInvalidContentTypeError(key, contentType);
    }
    if (bytes.byteLength === 0 || bytes.byteLength > definition.maxSizeBytes) {
      throw new BrandingAssetTooLargeError(
        key,
        bytes.byteLength,
        definition.maxSizeBytes,
      );
    }

    const contentBase64 = Buffer.from(bytes).toString("base64");
    const contentHash = createHash("sha256").update(bytes).digest("hex");
    const now = Date.now();

    try {
      await this.db
        .insertInto("server_branding_assets")
        .values({
          asset_key: key,
          content_base64: contentBase64,
          content_type: normalizedContentType,
          content_hash: contentHash,
          size_bytes: bytes.byteLength,
          created_at: now,
          updated_at: now,
          updated_by: updatedBy ?? null,
        })
        .onConflict((oc) =>
          oc.column("asset_key").doUpdateSet({
            content_base64: contentBase64,
            content_type: normalizedContentType,
            content_hash: contentHash,
            size_bytes: bytes.byteLength,
            updated_at: now,
            updated_by: updatedBy ?? null,
          }),
        )
        .execute();
    } catch (e: unknown) {
      console.error(`[BrandingAssetsRegistry] Failed to set asset "${key}":`, e);
      throw new Error(`Failed to set branding asset "${key}"`);
    }

    await this.invalidateCache(key);

    return {
      key,
      contentBase64,
      contentType: normalizedContentType,
      contentHash,
      sizeBytes: bytes.byteLength,
      updatedAt: now,
    };
  }

  /**
   * Delete a branding asset from the database (reverts the slot to its
   * default behavior).
   */
  public async deleteAsset(key: BrandingAssetKey): Promise<void> {
    try {
      await this.db
        .deleteFrom("server_branding_assets")
        .where("asset_key", "=", key)
        .execute();
    } catch (e: unknown) {
      console.error(
        `[BrandingAssetsRegistry] Failed to delete asset "${key}":`,
        e,
      );
      throw new Error(`Failed to delete branding asset "${key}"`);
    }

    await this.invalidateCache(key);
  }

  /**
   * List metadata (everything except the image content) for every known
   * branding asset slot, including slots still using the default asset.
   */
  public async listAssetMetadata(): Promise<BrandingAssetMetadataRecord[]> {
    let rows: Omit<ServerBrandingAssetRow, "content_base64">[];
    try {
      rows = await this.db
        .selectFrom("server_branding_assets")
        .select([
          "asset_key",
          "content_type",
          "content_hash",
          "size_bytes",
          "created_at",
          "updated_at",
          "updated_by",
        ])
        .execute();
    } catch (e: unknown) {
      console.error(
        "[BrandingAssetsRegistry] Failed to list assets from database:",
        e,
      );
      rows = [];
    }

    const rowMap = new Map<string, (typeof rows)[number]>();
    for (const row of rows) {
      rowMap.set(row.asset_key, row);
    }

    return getAllBrandingAssetKeys().map(
      (key): BrandingAssetMetadataRecord => {
        const definition = getBrandingAssetDefinition(key);
        const row = rowMap.get(key);
        return {
          key,
          label: definition.label,
          description: definition.description,
          allowedContentTypes: definition.allowedContentTypes,
          maxSizeBytes: definition.maxSizeBytes,
          recommendedDimensions: definition.recommendedDimensions,
          hasCustomAsset: Boolean(row),
          contentType: row?.content_type ?? null,
          contentHash: row?.content_hash ?? null,
          sizeBytes: row?.size_bytes ?? null,
          updatedAt: row
            ? typeof row.updated_at === "number"
              ? row.updated_at
              : parseInt(row.updated_at)
            : null,
          updatedBy: row?.updated_by ?? null,
        };
      },
    );
  }

  /**
   * Map of asset key -> content hash of the uploaded custom asset, or null
   * for slots still using the default. Redis-cached because generateMetadata()
   * calls this on every page render to build cache-busted /branding/* URLs.
   */
  public async getAssetVersions(): Promise<
    Record<BrandingAssetKey, string | null>
  > {
    if (this.redis) {
      try {
        const cached = await this.redis.get(this.redisVersionsKey);
        if (cached !== null) {
          return JSON.parse(cached) as Record<BrandingAssetKey, string | null>;
        }
      } catch (e: unknown) {
        console.error(
          "[BrandingAssetsRegistry] Redis cache read failed for asset versions, falling back to database:",
          e,
        );
      }
    }

    let rows: Pick<ServerBrandingAssetRow, "asset_key" | "content_hash">[];
    try {
      rows = await this.db
        .selectFrom("server_branding_assets")
        .select(["asset_key", "content_hash"])
        .execute();
    } catch (e: unknown) {
      console.error(
        "[BrandingAssetsRegistry] Failed to query asset versions:",
        e,
      );
      throw new Error("Error attempting to query branding asset versions");
    }

    const hashByKey = new Map<string, string>();
    for (const row of rows) {
      hashByKey.set(row.asset_key, row.content_hash);
    }
    const versions = Object.fromEntries(
      getAllBrandingAssetKeys().map((key) => [key, hashByKey.get(key) ?? null]),
    ) as Record<BrandingAssetKey, string | null>;

    if (this.redis) {
      try {
        await this.redis.set(
          this.redisVersionsKey,
          JSON.stringify(versions),
          "EX",
          this.redisTtlSeconds,
        );
      } catch (e: unknown) {
        console.error(
          "[BrandingAssetsRegistry] Failed to populate Redis cache for asset versions:",
          e,
        );
      }
    }

    return versions;
  }

  private async invalidateCache(key: BrandingAssetKey): Promise<void> {
    if (!this.redis) return;
    try {
      await this.redis.del(this.redisKey(key), this.redisVersionsKey);
    } catch (e: unknown) {
      console.error(
        `[BrandingAssetsRegistry] Failed to invalidate Redis cache for "${key}":`,
        e,
      );
    }
  }
}

export default BrandingAssetsRegistry;
