import type {
  DynamicClientGrantType,
  DynamicClientResponseType,
  ResourceOwnerType,
  SchemaVaultsApp,
} from "@schemavaults/app-definitions";

import type {
  ColumnType,
  Insertable,
  Selectable,
  Updateable,
} from "@schemavaults/dbh";

/**
 * A JSONB column holding a JSON array: read back as the parsed array,
 * written as JSON text (a JS array bound directly would be sent as a
 * Postgres array literal, which JSONB rejects).
 */
type JsonArrayColumn<T> = ColumnType<T[] | null, string | null, string | null>;

/**
 * Database representation of a client application declaration.
 *
 * Differs from the API-facing `SchemaVaultsApp` only in the ownership
 * columns, which are stored explicitly (migration 00037):
 * - `owner_type` is NOT NULL.
 * - Platform-owned rows store a NULL `owner_organization_id` (the API-facing
 *   definition reports the deployment's virtual owner organization instead;
 *   see `parseAppDefinitionDatabaseRow`).
 * - `owner_uid` is set only for user-owned rows.
 *
 * The RFC 7591 metadata columns (migration 00040; `client_uri`,
 * `contacts`, `grant_types`, `token_endpoint_auth_method`, ...) are part of
 * the shared definition shape and NULL for every app that was not created
 * through dynamic client registration. `contacts`, `grant_types` and
 * `response_types` are JSONB columns.
 */
export type AppsTable = Omit<
  SchemaVaultsApp,
  | "owner_type"
  | "owner_organization_id"
  | "owner_uid"
  | "created_by"
  | "contacts"
  | "grant_types"
  | "response_types"
> & {
  owner_type: ResourceOwnerType;
  owner_organization_id: string | null;
  owner_uid: string | null;
  created_by: string | null;
  contacts: JsonArrayColumn<string>;
  grant_types: JsonArrayColumn<DynamicClientGrantType>;
  response_types: JsonArrayColumn<DynamicClientResponseType>;
};

export type App = Selectable<AppsTable>;
export type NewApp = Insertable<AppsTable>;
export type AppUpdate = Updateable<AppsTable>;
