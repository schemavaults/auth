import "server-only";
import os from "node:os";
import path from "node:path";
import {
  InMemorySandboxStore,
  SandboxManager,
  type ExecResult,
  type SandboxRecord,
} from "@schemavaults/sandbox-management-sdk";
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
 * records in memory and runs sandboxes with the local-process provider, so it
 * needs neither a database nor Docker, in CI or in a deployment. That provider
 * is no isolation boundary; it runs in production too because this example
 * holds no real data, the agent only ever runs its fixed tool commands (user
 * input never reaches a shell), the sandboxes get none of the server's
 * environment, and session-limits.ts bounds how many exist. A deployment with
 * real data would pass the Docker or Vercel provider and the dbh store instead
 * (see the @schemavaults/sandbox-management-sdk README); nothing else changes.
 *
 * Everything lives in this server process's memory, so one long-running
 * process (the Dockerfile's `production` image) serves it fully; on a
 * serverless host it works while requests reach the same warm instance.
 */
export function createAgentSandboxManager(): SandboxManager {
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
