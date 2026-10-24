import type { ApiScopeGrantee, ApiServerScope } from "@schemavaults/auth-common";
import type {
  Generated,
  Insertable,
  Selectable,
  Updateable,
} from "@schemavaults/dbh";

/** API_SERVER_SCOPES (migrations 00046 / 00047). */
export type ApiServerScopesTable = Omit<ApiServerScope, "allow_dynamic_clients"> & {
  allow_dynamic_clients: Generated<boolean>;
};

export type ApiServerScopeRow = Selectable<ApiServerScopesTable>;
export type NewApiServerScopeRow = Insertable<ApiServerScopesTable>;
export type ApiServerScopeRowUpdate = Updateable<ApiServerScopesTable>;

/**
 * APP_API_SCOPE_POLICIES (migration 00047): whether the scopes users may
 * grant a connected app are restricted. No row = unrestricted.
 */
export interface AppApiScopePoliciesTable {
  client_app_id: string;
  api_server_id: string;
  restrict_user_scopes: Generated<boolean>;
  updated_at: number;
  updated_by: string | null;
}

/**
 * APP_API_SCOPE_GRANTS (migration 00047): the scopes allowed per connection
 * for users to grant (when restricted) and for the app's service account.
 */
export interface AppApiScopeGrantsTable {
  client_app_id: string;
  api_server_id: string;
  api_server_scope_id: string;
  grantee: ApiScopeGrantee;
  created_at: number;
  created_by: string | null;
}

/** USER_APP_SCOPE_CONSENTS (migration 00047): the API scopes each user granted each app. */
export interface UserAppScopeConsentsTable {
  uid: string;
  client_app_id: string;
  api_server_id: string;
  api_server_scope_id: string;
  granted_at: number;
}
