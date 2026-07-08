import type { Insertable, Selectable, Updateable } from "@schemavaults/dbh";

/**
 * Database table schema for server_branding_assets.
 *
 * Stores administrator-uploaded white-label branding images (favicon, app
 * icon, opengraph image). Image bytes are stored base64-encoded in a TEXT
 * column to match the TEXT-serialized storage convention of server_settings.
 */
export interface ServerBrandingAssetsTable {
  asset_key: string;
  content_base64: string;
  content_type: string;
  content_hash: string;
  size_bytes: number;
  created_at: number | string;
  updated_at: number | string;
  updated_by: string | null;
}

export type ServerBrandingAssetRow = Selectable<ServerBrandingAssetsTable>;
export type NewServerBrandingAssetRow = Insertable<ServerBrandingAssetsTable>;
export type ServerBrandingAssetRowUpdate =
  Updateable<ServerBrandingAssetsTable>;
