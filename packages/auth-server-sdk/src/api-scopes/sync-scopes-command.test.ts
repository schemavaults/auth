import { afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { generateJwtSigningKeyPair } from "@schemavaults/jwt";
import {
  SYNC_SCOPES_ENV_KEYS,
  SYNC_SCOPES_EXIT_CODES,
  runSyncScopesCommand,
} from "./sync-scopes-command";

const AUTH_SERVER_URL = "https://auth.example.com" as const;
const API_SERVER_ID = "notes-api" as const;

let private_pem: string;
let directory: string;
let saved: Record<string, string | undefined>;

beforeAll(async () => {
  [private_pem] = await generateJwtSigningKeyPair();
});

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "sync-scopes-"));
  saved = Object.fromEntries(SYNC_SCOPES_ENV_KEYS.map((key) => [key, process.env[key]]));
  process.env.SCHEMAVAULTS_API_SERVER_ID = API_SERVER_ID;
  process.env.SCHEMAVAULTS_AUTH_SERVER_URL = AUTH_SERVER_URL;
  process.env.SCHEMAVAULTS_AUTH_JWKS_ACCESS_PRIVATE_KEY = private_pem;
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

interface Output {
  stdout: string[];
  stderr: string[];
}

function run(args: string[], fetchImpl?: typeof fetch): Promise<{ code: number } & Output> {
  const output: Output = { stdout: [], stderr: [] };
  return runSyncScopesCommand(args, {
    cwd: directory,
    stdout: (line) => output.stdout.push(line),
    stderr: (line) => output.stderr.push(line),
    ...(fetchImpl ? { fetch: fetchImpl } : {}),
  }).then((code) => ({ code, ...output }));
}

function answer(status: number, body: unknown): { fetch: typeof fetch; urls: string[] } {
  const urls: string[] = [];
  const stub = (async (input: string | URL | Request) => {
    urls.push(String(input));
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  return { fetch: stub, urls };
}

function result(data: Record<string, unknown>) {
  return {
    success: true,
    data: {
      api_server_id: API_SERVER_ID,
      dry_run: false,
      created: [],
      updated: [],
      unchanged: [],
      not_in_manifest: [],
      ...data,
    },
  };
}

function writeManifest(manifest: unknown, name = "api-scopes.json"): string {
  writeFileSync(join(directory, name), JSON.stringify(manifest));
  return name;
}

const MANIFEST = {
  $schema: `${AUTH_SERVER_URL}/json-schema/api-server-scopes.json`,
  scopes: [
    { scope: "notes:read", description: "Read your notes." },
    { scope: "notes:write", description: "Write your notes.", allow_dynamic_clients: true },
  ],
};

describe("auth-server-sdk sync-scopes", () => {
  test("syncs a manifest and prints one line per created, updated and not_in_manifest scope (exit 0)", async () => {
    const manifest = writeManifest(MANIFEST);
    const { fetch, urls } = answer(
      200,
      result({
        created: [{ scope: "notes:read", description: "Read your notes.", allow_dynamic_clients: true }],
        updated: [
          {
            scope: "notes:write",
            description: "Write your notes.",
            allow_dynamic_clients: true,
            previous: { allow_dynamic_clients: false },
          },
        ],
        not_in_manifest: [{ scope: "legacy:read", description: "Legacy." }],
      }),
    );
    const { code, stdout, stderr } = await run(["sync-scopes", "--manifest", manifest], fetch);
    expect(code).toBe(SYNC_SCOPES_EXIT_CODES.ok);
    expect(urls).toEqual([`${AUTH_SERVER_URL}/api/resource-server/apis/${API_SERVER_ID}/scopes`]);
    expect(stdout[0]).toStartWith("+ create  notes:read");
    expect(stdout[1]).toBe("~ update  notes:write  allow_dynamic_clients: false -> true");
    expect(stderr).toHaveLength(1);
    expect(stderr[0]).toStartWith("! not in manifest  legacy:read");
    expect(stdout.at(-1)).toContain("1 created, 1 updated, 0 unchanged, 1 not in manifest");
  });

  test("--dry-run asks for a dry run and exits 0 even with drift", async () => {
    const manifest = writeManifest(MANIFEST);
    const { fetch, urls } = answer(
      200,
      result({
        dry_run: true,
        created: [{ scope: "notes:read", description: "Read your notes.", allow_dynamic_clients: true }],
      }),
    );
    const { code, stdout } = await run(["sync-scopes", "--manifest", manifest, "--dry-run"], fetch);
    expect(code).toBe(SYNC_SCOPES_EXIT_CODES.ok);
    expect(new URL(urls[0] ?? "").searchParams.get("dry_run")).toBe("true");
    expect(stdout[0]).toStartWith("+ would create  notes:read");
  });

  test("--check exits 2 on drift and 0 when everything matches", async () => {
    const manifest = writeManifest(MANIFEST);
    const drift = answer(
      200,
      result({
        dry_run: true,
        updated: [
          {
            scope: "notes:write",
            description: "Write your notes.",
            allow_dynamic_clients: true,
            previous: { description: "Old." },
          },
        ],
        unchanged: ["notes:read"],
      }),
    );
    const drifted = await run(["sync-scopes", "--manifest", manifest, "--check"], drift.fetch);
    expect(drifted.code).toBe(SYNC_SCOPES_EXIT_CODES.drift);
    expect(new URL(drift.urls[0] ?? "").searchParams.get("dry_run")).toBe("true");

    // Scopes only on the auth server are not drift: they only warn.
    const clean = answer(
      200,
      result({
        dry_run: true,
        unchanged: ["notes:read", "notes:write"],
        not_in_manifest: [{ scope: "legacy:read", description: "Legacy." }],
      }),
    );
    expect((await run(["sync-scopes", "--manifest", manifest, "--check"], clean.fetch)).code).toBe(
      SYNC_SCOPES_EXIT_CODES.ok,
    );
  });

  test("exits 1 on a refusal, an invalid manifest, unreadable JSON or missing flags", async () => {
    const manifest = writeManifest(MANIFEST);
    const refused = answer(409, { success: false, error: "too_many_scopes", message: "Too many scopes" });
    const refusal = await run(["sync-scopes", "--manifest", manifest], refused.fetch);
    expect(refusal.code).toBe(SYNC_SCOPES_EXIT_CODES.error);
    expect(refusal.stderr.join("\n")).toContain("too_many_scopes");

    const neverCalled = answer(200, result({}));
    const invalid = writeManifest({ scopes: [{ scope: "openid", description: "Reserved." }] }, "invalid.json");
    const invalidRun = await run(["sync-scopes", "--manifest", invalid], neverCalled.fetch);
    expect(invalidRun.code).toBe(SYNC_SCOPES_EXIT_CODES.error);
    expect(invalidRun.stderr.join("\n")).toContain("scopes.0.scope");

    writeFileSync(join(directory, "broken.json"), "{ not json");
    expect((await run(["sync-scopes", "--manifest", "broken.json"], neverCalled.fetch)).code).toBe(
      SYNC_SCOPES_EXIT_CODES.error,
    );
    expect((await run(["sync-scopes"], neverCalled.fetch)).code).toBe(SYNC_SCOPES_EXIT_CODES.error);
    expect((await run(["sync-scopes", "--manifest"], neverCalled.fetch)).code).toBe(SYNC_SCOPES_EXIT_CODES.error);
    expect(neverCalled.urls).toHaveLength(0);
  });

  test("exits 1 when the API server settings are missing", async () => {
    const manifest = writeManifest(MANIFEST);
    delete process.env.SCHEMAVAULTS_AUTH_JWKS_ACCESS_PRIVATE_KEY;
    const { fetch, urls } = answer(200, result({}));
    const { code, stderr } = await run(["sync-scopes", "--manifest", manifest], fetch);
    expect(code).toBe(SYNC_SCOPES_EXIT_CODES.error);
    expect(stderr.join("\n")).toContain("SCHEMAVAULTS_AUTH_JWKS_ACCESS_PRIVATE_KEY");
    expect(urls).toHaveLength(0);
  });

  test("--env-file loads the settings first, winning over the environment", async () => {
    const manifest = writeManifest(MANIFEST);
    process.env.SCHEMAVAULTS_API_SERVER_ID = "dev-api";
    process.env.SCHEMAVAULTS_AUTH_SERVER_URL = "http://localhost:6767";
    delete process.env.SCHEMAVAULTS_AUTH_JWKS_ACCESS_PRIVATE_KEY;
    writeFileSync(
      join(directory, ".env.production"),
      [
        "# production settings",
        `SCHEMAVAULTS_API_SERVER_ID=${API_SERVER_ID}`,
        `export SCHEMAVAULTS_AUTH_SERVER_URL="${AUTH_SERVER_URL}"`,
        `SCHEMAVAULTS_AUTH_JWKS_ACCESS_PRIVATE_KEY="${private_pem}"`,
        "UNRELATED=ignored",
      ].join("\n"),
    );
    const { fetch, urls } = answer(200, result({ unchanged: ["notes:read", "notes:write"] }));
    const { code } = await run(
      ["sync-scopes", "--env-file", ".env.production", "--manifest", manifest],
      fetch,
    );
    expect(code).toBe(SYNC_SCOPES_EXIT_CODES.ok);
    expect(urls).toEqual([`${AUTH_SERVER_URL}/api/resource-server/apis/${API_SERVER_ID}/scopes`]);
    expect(process.env.UNRELATED).toBeUndefined();
  });

  test("--init writes a starter manifest naming the configured auth server, and never overwrites", async () => {
    process.env.SCHEMAVAULTS_AUTH_SERVER_URL = "https://id.acme.test";
    const first = await run(["sync-scopes", "--init"]);
    expect(first.code).toBe(SYNC_SCOPES_EXIT_CODES.ok);
    const written = JSON.parse(readFileSync(join(directory, "api-scopes.json"), "utf8"));
    expect(written.$schema).toBe("https://id.acme.test/json-schema/api-server-scopes.json");
    expect(written.scopes).toBeArray();

    const custom = await run(["sync-scopes", "--init", "--manifest", "scopes/../custom.json"]);
    expect(custom.code).toBe(SYNC_SCOPES_EXIT_CODES.ok);
    expect(JSON.parse(readFileSync(join(directory, "custom.json"), "utf8")).$schema).toBe(written.$schema);

    const again = await run(["sync-scopes", "--init"]);
    expect(again.code).toBe(SYNC_SCOPES_EXIT_CODES.error);
    expect(again.stderr.join("\n")).toContain("already exists");
  });
});
