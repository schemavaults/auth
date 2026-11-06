import "server-only";
import os from "node:os";
import path from "node:path";
import {
  InMemorySandboxStore,
  SandboxManager,
  type ExecResult,
  type SandboxRecord,
} from "@schemavaults/sandbox-management-sdk";
import type { SchemaVaultsAppEnvironment } from "@schemavaults/auth-server-sdk";
import { LocalProcessSandboxProvider } from "./local-process-provider";
import {
  AGENT_API_BASE_URL_ENV,
  AGENT_API_TOOL_PATH,
  AGENT_API_TOOL_SOURCE,
  AGENT_TOKEN_FILE,
  AGENT_TOKEN_FILE_ENV,
} from "./agent-tools";

/**
 * The `SandboxManager` agent sessions run in. This example keeps sandbox
 * records in memory and runs sandboxes with the local-process provider, so
 * its CI needs neither a database nor Docker. A deployment would pass the
 * Docker or Vercel provider and the dbh store instead (see the
 * @schemavaults/sandbox-management-sdk README); nothing else changes.
 *
 * The local-process provider is no isolation boundary, so it is refused in
 * production and staging.
 */
export function createAgentSandboxManager(environment: SchemaVaultsAppEnvironment): SandboxManager {
  if (environment === "production" || environment === "staging") {
    throw new Error(
      `The agent sessions example runs sandboxes as local processes, which is not safe in '${environment}'`,
    );
  }
  return new SandboxManager({
    providers: [
      new LocalProcessSandboxProvider({ rootDir: path.join(os.tmpdir(), "example-agent-sandboxes") }),
    ],
    store: new InMemorySandboxStore(),
  });
}

export interface CreateAgentSandboxOptions {
  manager: SandboxManager;
  agentSessionId: string;
  /** The user the agent acts for. */
  ownerId: string;
  /** Where the agent reaches the example API. */
  apiBaseUrl: string;
  /** The agent's delegated access token. */
  accessToken: string;
}

/** Creates an agent's sandbox: the API tool, and the agent's token in a file. */
export async function createAgentSandbox({
  manager,
  agentSessionId,
  ownerId,
  apiBaseUrl,
  accessToken,
}: CreateAgentSandboxOptions): Promise<SandboxRecord> {
  const record = await manager.create({
    spec: {
      env: {
        [AGENT_API_BASE_URL_ENV]: apiBaseUrl,
        [AGENT_TOKEN_FILE_ENV]: AGENT_TOKEN_FILE,
      },
    },
    ownerId,
    labels: { app: "example-agents", "agent-session": agentSessionId },
  });
  await manager.writeFiles(record.id, [
    { path: AGENT_API_TOOL_PATH, content: AGENT_API_TOOL_SOURCE, mode: 0o644 },
    { path: AGENT_TOKEN_FILE, content: accessToken, mode: 0o600 },
  ]);
  return record;
}

/** Replaces the agent's token, e.g. after minting a fresh delegated token. */
export async function writeAgentAccessToken(
  manager: SandboxManager,
  sandboxId: string,
  accessToken: string,
): Promise<void> {
  await manager.writeFiles(sandboxId, [{ path: AGENT_TOKEN_FILE, content: accessToken, mode: 0o600 }]);
}

/** Runs one of the agent's tool commands in its sandbox. */
export async function runInAgentSandbox(
  manager: SandboxManager,
  sandboxId: string,
  command: string,
): Promise<ExecResult> {
  return manager.exec(sandboxId, command, { timeoutMs: 20_000 });
}
