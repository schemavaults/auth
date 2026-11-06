// NOT server-only: pure constants and helpers (unit tested), used in the browser.

/** Where the agent's credential lives inside its sandbox (relative to the workdir). */
export const AGENT_TOKEN_FILE = ".agent/access-token" as const;

/**
 * The sandbox's environment: where the API is and where the token file is.
 * Not the token itself: it is a file the app rewrites whenever it gets the
 * agent a fresh delegated token, so it never lands in the sandbox record
 * (which keeps `spec.env` as-is).
 */
export const AGENT_API_BASE_URL_ENV = "SCHEMAVAULTS_API_BASE_URL" as const;
export const AGENT_TOKEN_FILE_ENV = "SCHEMAVAULTS_ACCESS_TOKEN_FILE" as const;

export type AgentApiMethod = "GET" | "POST";

/**
 * The command that calls `method path` on the example API with the sandbox's
 * token: the agent shell's `api` command (see browser/agent-shell.ts), which
 * prints the response as `{"status": ..., "body": ...}`.
 */
export function agentApiCommand(method: AgentApiMethod, path: `/${string}`): string {
  return `api ${method} ${path}`;
}

/** What the `api` command printed, or null when it printed something else. */
export interface AgentApiToolOutput {
  status: number;
  body: unknown;
}

export function parseAgentApiToolOutput(stdout: string): AgentApiToolOutput | null {
  try {
    const parsed: unknown = JSON.parse(stdout);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "status" in parsed &&
      typeof parsed.status === "number"
    ) {
      return { status: parsed.status, body: "body" in parsed ? parsed.body : null };
    }
  } catch {
    // Not the tool's output.
  }
  return null;
}
