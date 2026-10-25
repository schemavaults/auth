export {
  syncApiServerScopes,
  syncApiServerScopes as default,
  parseApiScopeManifestScopes,
  apiServerScopesSyncPath,
} from "./sync-api-server-scopes";
export type { SyncApiServerScopesOptions } from "./sync-api-server-scopes";
export { ApiScopeSyncFailedError, InvalidApiScopeManifestError } from "./errors";
export type { ApiScopeManifestIssue } from "./errors";

// The manifest JSON Schema every auth server serves (`$schema` of manifest
// files): `new URL(API_SERVER_SCOPES_JSON_SCHEMA_PATH, auth_server_url)`.
export {
  API_SERVER_SCOPES_JSON_SCHEMA_PATH,
  hasApiScopeSyncDrift,
} from "@schemavaults/auth-common";
export type {
  ApiScopeManifestEntry,
  ApiScopeManifestEntryInput,
  ApiServerScopeSyncResult,
  SyncApiServerScopesRequest,
  SyncApiServerScopesRequestInput,
  SyncedApiScope,
  UpdatedApiScope,
} from "@schemavaults/auth-common";
