import type {
  ResourceOwnerType,
  ResourceUrlMatchMode,
  SchemaVaultsApiServerDefinition,
} from "@schemavaults/app-definitions";

import type {
  Generated,
  Insertable,
  Selectable,
  Updateable,
} from "@schemavaults/dbh";

/**
 * Database representation of an API server declaration.
 *
 * Differs from the API-facing `SchemaVaultsApiServerDefinition` only in the
 * ownership columns, which are stored explicitly (migration 00037):
 * - `owner_type` is NOT NULL.
 * - Platform-owned rows store a NULL `owner_organization_id` (the API-facing
 *   definition reports the deployment's virtual owner organization instead;
 *   see `parseApiServerDefinitionDatabaseRow`).
 * - `owner_uid` is set only for user-owned rows.
 * - The dynamic-client policy columns (migration 00040) are NOT NULL with
 *   defaults (`false` / `'exact'`), so inserts may omit them.
 */
export type ApiServersTable = Omit<
  SchemaVaultsApiServerDefinition,
  | "owner_type"
  | "owner_organization_id"
  | "owner_uid"
  | "created_by"
  | "allow_dynamic_clients"
  | "resource_url_match_mode"
> & {
  owner_type: ResourceOwnerType;
  owner_organization_id: string | null;
  owner_uid: string | null;
  created_by: string | null;
  allow_dynamic_clients: Generated<boolean>;
  resource_url_match_mode: Generated<ResourceUrlMatchMode>;
};

export type ApiServer = Selectable<ApiServersTable>;
export type NewApiServer = Insertable<ApiServersTable>;
export type ApiServerUpdate = Updateable<ApiServersTable>;
