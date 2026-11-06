// NOT server-only: pure constants and command builders (unit tested).

/** Where the agent's credential lives inside its sandbox (relative to the workdir). */
export const AGENT_TOKEN_FILE = ".agent/access-token" as const;

/** The tool the agent calls the example API with (relative to the workdir). */
export const AGENT_API_TOOL_PATH = "agent-tools/api.mjs" as const;

/**
 * The sandbox's environment: where the API is and where the token file is.
 * Not the token itself: it is a file the backend rewrites whenever it mints
 * a fresh delegated token, so it never lands in the sandbox store (which
 * keeps `spec.env` as-is) and never outlives the sandbox.
 */
export const AGENT_API_BASE_URL_ENV = "SCHEMAVAULTS_API_BASE_URL" as const;
export const AGENT_TOKEN_FILE_ENV = "SCHEMAVAULTS_ACCESS_TOKEN_FILE" as const;

/**
 * Source of `agent-tools/api.mjs`, written into every agent sandbox: calls the
 * example API with the sandbox's delegated access token and prints the
 * response as `{"status": ..., "body": ...}`. Exit code 0 for a 2xx, 1 for
 * another status, 2 for a misconfigured sandbox, 3 when the API is
 * unreachable.
 */
export const AGENT_API_TOOL_SOURCE = `// Runs inside an agent's sandbox: calls the example API as the agent.
import { readFile } from "node:fs/promises";

const [method = "GET", path = "/"] = process.argv.slice(2);
const base = process.env.${AGENT_API_BASE_URL_ENV};
const tokenFile = process.env.${AGENT_TOKEN_FILE_ENV};
if (!base || !tokenFile) {
  console.error("${AGENT_API_BASE_URL_ENV} and ${AGENT_TOKEN_FILE_ENV} must be set");
  process.exit(2);
}
const token = (await readFile(tokenFile, "utf8")).trim();

let response;
try {
  response = await fetch(new URL(path, base), {
    method,
    headers: { Authorization: \`Bearer \${token}\`, Accept: "application/json" },
  });
} catch (error) {
  console.error(\`Request to \${base} failed: \${error instanceof Error ? error.message : error}\`);
  process.exit(3);
}
const text = await response.text();
let body = text;
try {
  body = JSON.parse(text);
} catch {
  // Not JSON: print it as text.
}
console.log(JSON.stringify({ status: response.status, body }, null, 2));
process.exit(response.ok ? 0 : 1);
`;

export type AgentApiMethod = "GET" | "POST";

/** The shell command that calls `method path` with the API tool. */
export function agentApiCommand(method: AgentApiMethod, path: `/${string}`): string {
  return `node ${AGENT_API_TOOL_PATH} ${method} ${path}`;
}

/** What `agent-tools/api.mjs` printed, or null when it printed something else. */
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
