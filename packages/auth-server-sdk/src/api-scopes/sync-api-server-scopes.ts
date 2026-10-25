import { createJwksAccessProofToken } from "@schemavaults/jwt";
import {
  type ApiServerId,
  apiServerIdSchema,
} from "@schemavaults/app-definitions";
import {
  apiScopeManifestEntries,
  syncApiServerScopesRequestSchema,
  syncApiServerScopesResponseSchema,
  type ApiScopeManifestEntryInput,
  type ApiServerScopeSyncResult,
  type SyncApiServerScopesRequest,
} from "@schemavaults/auth-common";
import type { z } from "zod";
import getSchemavaultsApiServerId from "@/env/get-schemavaults-api-server-id";
import getSchemaVaultsAuthServerUrl from "@/env/get-schemavaults-auth-server-url";
import loadJwksAccessPrivateKey from "@/env/loadJwksAccessPrivateKey";
import {
  ApiScopeSyncFailedError,
  InvalidApiScopeManifestError,
  type ApiScopeManifestIssue,
} from "./errors";

/** Path of the sync endpoint on the auth server. */
export function apiServerScopesSyncPath(api_server_id: ApiServerId): string {
  return `/api/resource-server/apis/${encodeURIComponent(api_server_id)}/scopes`;
}

export interface SyncApiServerScopesOptions {
  /**
   * The API server's whole scope list, or the shorthand
   * `{ [scope]: description }` (which keeps every scope's current
   * `allow_dynamic_clients`).
   */
  readonly scopes:
    | readonly ApiScopeManifestEntryInput[]
    | Readonly<Record<string, string>>;
  /** Report what the sync would do without writing anything. */
  readonly dry_run?: boolean;
  /** Default: `SCHEMAVAULTS_API_SERVER_ID`. */
  readonly api_server_id?: ApiServerId;
  /** Default: `getSchemaVaultsAuthServerUrl()` (`SCHEMAVAULTS_AUTH_SERVER_URL` or the app environment's default). */
  readonly auth_server_url?: string;
  /** Default: `loadJwksAccessPrivateKey()` (`SCHEMAVAULTS_AUTH_JWKS_ACCESS_PRIVATE_KEY`). */
  readonly jwks_access_private_key?: CryptoKey;
  /** Override for tests. */
  readonly fetch?: typeof fetch;
}

function zodIssues(error: z.ZodError): ApiScopeManifestIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.map(String).join("."),
    message: issue.message,
  }));
}

/**
 * Validates a manifest's scopes with the schema the auth server checks
 * them with (`syncApiServerScopesRequestSchema`), without calling it.
 *
 * @throws InvalidApiScopeManifestError listing every problem.
 */
export function parseApiScopeManifestScopes(
  scopes: SyncApiServerScopesOptions["scopes"],
): SyncApiServerScopesRequest["scopes"] {
  const parsed = syncApiServerScopesRequestSchema.safeParse({
    scopes: apiScopeManifestEntries(scopes),
  });
  if (!parsed.success) {
    throw new InvalidApiScopeManifestError(zodIssues(parsed.error));
  }
  return parsed.data.scopes;
}

function readErrorBody(body: unknown): {
  code: string | null;
  message: string | null;
  issues: ApiScopeManifestIssue[];
} {
  if (typeof body !== "object" || body === null) {
    return { code: null, message: null, issues: [] };
  }
  const record = body as Record<string, unknown>;
  const issues: ApiScopeManifestIssue[] = Array.isArray(record.issues)
    ? record.issues.flatMap((issue: unknown) => {
        if (typeof issue !== "object" || issue === null) return [];
        const { path, message } = issue as Record<string, unknown>;
        return typeof message === "string"
          ? [{ path: typeof path === "string" ? path : "", message }]
          : [];
      })
    : [];
  const error = typeof record.error === "string" ? record.error : null;
  const message = typeof record.message === "string" ? record.message : null;
  // The older resource-server envelope puts its reason text in `error`.
  return message === null
    ? { code: null, message: error, issues }
    : { code: error, message, issues };
}

/**
 * Defines the resource server's API scopes on the auth server from code
 * (`PUT /api/resource-server/apis/{api_server_id}/scopes`): the auth server
 * creates the listed scopes that are missing and updates the ones whose
 * description, or `allow_dynamic_clients` when an entry gives it, changed.
 * It never deletes; the scopes it defines that the list leaves out come
 * back as `not_in_manifest`.
 *
 * Authenticates as the API server with a fresh single-use JWKS access
 * assertion. The list is checked locally first, with the same schema the
 * auth server uses. Run it once per environment's auth server (each with
 * that deployment's API server key), before deploying code that requires
 * a new scope: no client can be granted a scope until it exists.
 *
 * @throws InvalidApiScopeManifestError when the list is invalid (nothing is sent).
 * @throws ApiScopeSyncFailedError when the auth server refuses the sync
 * (`status` and `code` say why) or answers with an unexpected body.
 */
export async function syncApiServerScopes(
  options: SyncApiServerScopesOptions,
): Promise<ApiServerScopeSyncResult> {
  const scopes = parseApiScopeManifestScopes(options.scopes);
  const dry_run: boolean = options.dry_run ?? false;

  const api_server_id: ApiServerId =
    options.api_server_id ?? getSchemavaultsApiServerId();
  if (!apiServerIdSchema.safeParse(api_server_id).success) {
    throw new TypeError("Invalid API server ID!");
  }
  const auth_server_url: string =
    options.auth_server_url ?? getSchemaVaultsAuthServerUrl();
  const private_key: CryptoKey =
    options.jwks_access_private_key ?? (await loadJwksAccessPrivateKey());
  const fetchImpl: typeof fetch = options.fetch ?? fetch;

  const assertion: string = await createJwksAccessProofToken({
    api_server_id,
    auth_server_url,
    private_key,
  });

  const url = new URL(apiServerScopesSyncPath(api_server_id), auth_server_url);
  if (dry_run) {
    url.searchParams.set("dry_run", "true");
  }

  const response = await fetchImpl(url.toString(), {
    method: "PUT",
    headers: new Headers({
      Authorization: `Bearer ${assertion}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    }),
    body: JSON.stringify({ scopes }),
  });

  let body: unknown;
  try {
    body = await response.json();
  } catch (e: unknown) {
    body = undefined;
    if (response.ok) {
      throw new ApiScopeSyncFailedError(
        "The auth server answered the scope sync with a body that is not JSON",
        { status: response.status, cause: e },
      );
    }
  }

  if (response.status !== 200) {
    const { code, message, issues } = readErrorBody(body);
    const hint: string =
      response.status === 404 && code !== "api_server_not_found"
        ? " (the auth server may predate scope sync)"
        : "";
    throw new ApiScopeSyncFailedError(
      `The auth server refused the scope sync (status: ${response.status}${code ? `, error: ${code}` : ""})${hint}${message ? `: ${message}` : ""}`,
      { status: response.status, code, issues },
    );
  }

  const parsed = syncApiServerScopesResponseSchema.safeParse(body);
  if (!parsed.success || parsed.data.data.api_server_id !== api_server_id) {
    throw new ApiScopeSyncFailedError(
      "Received an unexpected response to the scope sync",
      { status: response.status, ...(parsed.success ? {} : { cause: parsed.error }) },
    );
  }
  return parsed.data.data;
}

export default syncApiServerScopes;
