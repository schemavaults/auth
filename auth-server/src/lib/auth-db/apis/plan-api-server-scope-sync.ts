import type {
  ApiScopeManifestEntry,
  SyncedApiScope,
  UpdatedApiScope,
} from "@schemavaults/auth-common";

/**
 * The scope-sync rule (`PUT /api/resource-server/apis/{api_server_id}/scopes`)
 * as a pure function, so it can be tested without a database.
 *
 * - A listed scope the API server does not define yet is created, with the
 *   entry's `allow_dynamic_clients` or the registry's default (true).
 * - A listed scope it defines is updated when its description differs, or
 *   when the entry gives an `allow_dynamic_clients` that differs. An entry
 *   without `allow_dynamic_clients` keeps the scope's current value, so a
 *   choice made in the console stands.
 * - A defined scope the manifest leaves out is only reported: syncs never
 *   delete (deleting drops users' consents and per-app allowances).
 */

/** What the planner needs to know about a scope the API server defines. */
export interface ExistingApiServerScope {
  readonly api_server_scope_id: string;
  readonly scope: string;
  readonly description: string;
  readonly allow_dynamic_clients: boolean;
}

/** An update to write, with the id of the scope it changes. */
export interface PlannedApiScopeUpdate extends UpdatedApiScope {
  readonly api_server_scope_id: string;
}

export interface ApiServerScopeSyncPlan {
  /** Scopes to create, in manifest order. */
  readonly created: readonly SyncedApiScope[];
  /** Scopes to update, in manifest order. */
  readonly updated: readonly PlannedApiScopeUpdate[];
  /** Values of the listed scopes that already match, in manifest order. */
  readonly unchanged: readonly string[];
  /** Defined scopes the manifest leaves out, in the order they were given. */
  readonly not_in_manifest: readonly { scope: string; description: string }[];
}

/** `allow_dynamic_clients` of a scope created without one (the column default). */
export const DEFAULT_ALLOW_DYNAMIC_CLIENTS = true as const;

/**
 * @param existing the API server's scopes (oldest first)
 * @param manifest the parsed manifest entries (descriptions trimmed, no
 * repeated values; see `syncApiServerScopesRequestSchema`)
 */
export function planApiServerScopeSync(
  existing: readonly ExistingApiServerScope[],
  manifest: readonly ApiScopeManifestEntry[],
): ApiServerScopeSyncPlan {
  const byValue = new Map<string, ExistingApiServerScope>(
    existing.map((scope) => [scope.scope, scope]),
  );
  const listed = new Set<string>();

  const created: SyncedApiScope[] = [];
  const updated: PlannedApiScopeUpdate[] = [];
  const unchanged: string[] = [];

  for (const entry of manifest) {
    listed.add(entry.scope);
    const current = byValue.get(entry.scope);
    if (!current) {
      created.push({
        scope: entry.scope,
        description: entry.description,
        allow_dynamic_clients: entry.allow_dynamic_clients ?? DEFAULT_ALLOW_DYNAMIC_CLIENTS,
      });
      continue;
    }

    const previous: UpdatedApiScope["previous"] = {};
    if (entry.description !== current.description) {
      previous.description = current.description;
    }
    if (
      entry.allow_dynamic_clients !== undefined &&
      entry.allow_dynamic_clients !== current.allow_dynamic_clients
    ) {
      previous.allow_dynamic_clients = current.allow_dynamic_clients;
    }
    if (Object.keys(previous).length === 0) {
      unchanged.push(entry.scope);
      continue;
    }
    updated.push({
      api_server_scope_id: current.api_server_scope_id,
      scope: entry.scope,
      description: entry.description,
      allow_dynamic_clients: entry.allow_dynamic_clients ?? current.allow_dynamic_clients,
      previous,
    });
  }

  const not_in_manifest = existing
    .filter((scope) => !listed.has(scope.scope))
    .map(({ scope, description }) => ({ scope, description }));

  return { created, updated, unchanged, not_in_manifest };
}
