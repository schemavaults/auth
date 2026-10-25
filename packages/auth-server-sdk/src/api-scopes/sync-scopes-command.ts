import { existsSync } from "fs";
import { readFile, writeFile } from "fs/promises";
import { resolve } from "path";
import {
  API_SERVER_SCOPES_JSON_SCHEMA_PATH,
  hasApiScopeSyncDrift,
  syncApiServerScopesRequestSchema,
  type ApiServerScopeSyncResult,
} from "@schemavaults/auth-common";
import { readStringFlag } from "@/cli-args";
import getSchemaVaultsAuthServerUrl from "@/env/get-schemavaults-auth-server-url";
import { JWKS_ACCESS_PRIVATE_KEY_ENV_VAR_NAME } from "@/env/loadJwksAccessPrivateKey";
import { loadEnvFile } from "@/env/load-env-file";
import {
  ApiScopeSyncFailedError,
  InvalidApiScopeManifestError,
} from "./errors";
import { syncApiServerScopes } from "./sync-api-server-scopes";

/** Exit codes of `auth-server-sdk sync-scopes`. */
export const SYNC_SCOPES_EXIT_CODES = {
  /** Synced (or, under `--dry-run` / `--check`, nothing to do). */
  ok: 0,
  /** Any error: bad flags or manifest, missing settings, a refusal. */
  error: 1,
  /** `--check` only: the auth server's scopes differ from the manifest. */
  drift: 2,
} as const;

/** The settings `--env-file` loads (the ones `syncApiServerScopes()` reads). */
export const SYNC_SCOPES_ENV_KEYS = [
  "SCHEMAVAULTS_API_SERVER_ID",
  "SCHEMAVAULTS_AUTH_SERVER_URL",
  JWKS_ACCESS_PRIVATE_KEY_ENV_VAR_NAME,
  // Picks the default auth server URL when SCHEMAVAULTS_AUTH_SERVER_URL is unset.
  "SCHEMAVAULTS_APP_ENVIRONMENT",
] as const;

/** Where `--init` writes when `--manifest` is not given. */
export const DEFAULT_SCOPE_MANIFEST_PATH = "api-scopes.json" as const;

export const SYNC_SCOPES_HELP_TEXT = `  sync-scopes          Define this API server's scopes on the auth server
                       from a JSON manifest (never deletes a scope)

sync-scopes options:
  --manifest <path>           Scope manifest, shaped like
                              { "$schema": "...", "scopes": [...] }
  --init                      Write a starter manifest (to --manifest, default
                              ./${DEFAULT_SCOPE_MANIFEST_PATH}) naming the auth server's JSON Schema
  --dry-run                   Print what would change, write nothing
  --check                     Dry run that exits 2 when anything would be
                              created or updated (for CI)
  --env-file <path>           Load SCHEMAVAULTS_API_SERVER_ID,
                              SCHEMAVAULTS_AUTH_SERVER_URL,
                              ${JWKS_ACCESS_PRIVATE_KEY_ENV_VAR_NAME}
                              (and SCHEMAVAULTS_APP_ENVIRONMENT) from a file
                              first; its values win over the environment's
`;

export interface SyncScopesCommandIo {
  readonly stdout: (line: string) => void;
  readonly stderr: (line: string) => void;
  /** Directory relative paths resolve against. Default `process.cwd()`. */
  readonly cwd?: string;
  /** Override for tests. */
  readonly fetch?: typeof fetch;
}

function quote(text: string): string {
  return JSON.stringify(text);
}

function printResult(
  result: ApiServerScopeSyncResult,
  auth_server_url: string,
  io: SyncScopesCommandIo,
): void {
  const prefix = result.dry_run ? "would " : "";
  for (const scope of result.created) {
    io.stdout(
      `+ ${prefix}create  ${scope.scope}  ${quote(scope.description)}  (allow_dynamic_clients: ${scope.allow_dynamic_clients})`,
    );
  }
  for (const scope of result.updated) {
    const changes: string[] = [];
    if (scope.previous.description !== undefined) {
      changes.push(`description: ${quote(scope.previous.description)} -> ${quote(scope.description)}`);
    }
    if (scope.previous.allow_dynamic_clients !== undefined) {
      changes.push(
        `allow_dynamic_clients: ${scope.previous.allow_dynamic_clients} -> ${scope.allow_dynamic_clients}`,
      );
    }
    io.stdout(`~ ${prefix}update  ${scope.scope}  ${changes.join("; ")}`);
  }
  for (const scope of result.not_in_manifest) {
    io.stderr(
      `! not in manifest  ${scope.scope}  ${quote(scope.description)}  (kept; delete it in the console if it is no longer used)`,
    );
  }
  io.stdout(
    `${result.dry_run ? "Dry run for" : "Synced"} API server ${result.api_server_id} on ${auth_server_url}: ` +
      `${result.created.length} ${result.dry_run ? "to create" : "created"}, ` +
      `${result.updated.length} ${result.dry_run ? "to update" : "updated"}, ` +
      `${result.unchanged.length} unchanged, ${result.not_in_manifest.length} not in manifest`,
  );
}

/**
 * The configured auth server URL. Outside an app (e.g. in CI) the app
 * environment it depends on is often unset, so say which settings to add.
 */
function resolveAuthServerUrl(): string {
  try {
    return getSchemaVaultsAuthServerUrl();
  } catch (e: unknown) {
    throw new Error(
      `Could not determine the auth server URL (${e instanceof Error ? e.message : String(e)}). ` +
        "Set SCHEMAVAULTS_APP_ENVIRONMENT to development, test, staging or production, and " +
        "SCHEMAVAULTS_AUTH_SERVER_URL unless that environment's default auth server applies (e.g. in the --env-file).",
      { cause: e },
    );
  }
}

function starterManifest(auth_server_url: string): string {
  return `${JSON.stringify(
    {
      $schema: new URL(API_SERVER_SCOPES_JSON_SCHEMA_PATH, auth_server_url).toString(),
      scopes: [{ scope: "example:read", description: "Read your example data." }],
    },
    null,
    2,
  )}\n`;
}

/**
 * `auth-server-sdk sync-scopes`: reads a JSON scope manifest, checks it with
 * the shared schema and syncs it with {@link syncApiServerScopes}. Prints
 * one line per created, updated and `not_in_manifest` scope (the last only
 * warn).
 *
 * @param args the arguments after the command name.
 * @returns the process exit code ({@link SYNC_SCOPES_EXIT_CODES}).
 */
export async function runSyncScopesCommand(
  args: readonly string[],
  io: SyncScopesCommandIo,
): Promise<number> {
  const cwd: string = io.cwd ?? process.cwd();
  const manifestFlag = readStringFlag(args, "--manifest");
  const envFileFlag = readStringFlag(args, "--env-file");
  const init: boolean = args.includes("--init");
  const check: boolean = args.includes("--check");
  const dry_run: boolean = check || args.includes("--dry-run");

  if (manifestFlag.present && !manifestFlag.value) {
    io.stderr("Error: --manifest requires a path argument");
    return SYNC_SCOPES_EXIT_CODES.error;
  }
  if (envFileFlag.present && !envFileFlag.value) {
    io.stderr("Error: --env-file requires a path argument");
    return SYNC_SCOPES_EXIT_CODES.error;
  }

  try {
    if (envFileFlag.value) {
      await loadEnvFile(resolve(cwd, envFileFlag.value), SYNC_SCOPES_ENV_KEYS);
    }

    if (init) {
      const target: string = resolve(cwd, manifestFlag.value ?? DEFAULT_SCOPE_MANIFEST_PATH);
      if (existsSync(target)) {
        io.stderr(`Error: ${target} already exists; not overwriting it`);
        return SYNC_SCOPES_EXIT_CODES.error;
      }
      await writeFile(target, starterManifest(resolveAuthServerUrl()), {
        encoding: "utf8",
        flag: "wx",
      });
      io.stdout(`Wrote ${target}. Edit its scopes, then run: auth-server-sdk sync-scopes --manifest <path> --dry-run`);
      return SYNC_SCOPES_EXIT_CODES.ok;
    }

    if (!manifestFlag.value) {
      io.stderr("Error: sync-scopes requires --manifest <path> (or --init to write one)");
      return SYNC_SCOPES_EXIT_CODES.error;
    }
    const manifestPath: string = resolve(cwd, manifestFlag.value);

    let manifest: unknown;
    try {
      manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    } catch (e: unknown) {
      io.stderr(
        `Error: could not read ${manifestPath} as JSON: ${e instanceof Error ? e.message : String(e)}`,
      );
      return SYNC_SCOPES_EXIT_CODES.error;
    }
    const parsed = syncApiServerScopesRequestSchema.safeParse(manifest);
    if (!parsed.success) {
      io.stderr(`Error: invalid scope manifest ${manifestPath}:`);
      for (const issue of parsed.error.issues) {
        io.stderr(`  - ${issue.path.map(String).join(".") || "(manifest)"}: ${issue.message}`);
      }
      return SYNC_SCOPES_EXIT_CODES.error;
    }

    const auth_server_url: string = resolveAuthServerUrl();
    const result = await syncApiServerScopes({
      scopes: parsed.data.scopes,
      dry_run,
      auth_server_url,
      ...(io.fetch ? { fetch: io.fetch } : {}),
    });
    printResult(result, auth_server_url, io);

    if (check && hasApiScopeSyncDrift(result)) {
      io.stderr(
        "Scope drift: the auth server's scopes do not match the manifest. Run sync-scopes without --check to apply it.",
      );
      return SYNC_SCOPES_EXIT_CODES.drift;
    }
    return SYNC_SCOPES_EXIT_CODES.ok;
  } catch (e: unknown) {
    if (e instanceof ApiScopeSyncFailedError) {
      io.stderr(`Error: ${e.message}`);
      for (const issue of e.issues) {
        io.stderr(`  - ${issue.path || "(request)"}: ${issue.message}`);
      }
    } else if (e instanceof InvalidApiScopeManifestError) {
      io.stderr(`Error: ${e.message}`);
    } else {
      io.stderr(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }
    return SYNC_SCOPES_EXIT_CODES.error;
  }
}
