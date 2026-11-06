// NOT server-only: runs in the browser (unit tested).

import {
  resolveSandboxPath,
  type ExecResult,
  type NormalizedCommand,
} from "@schemavaults/sandbox-management-sdk";
import { AGENT_API_BASE_URL_ENV, AGENT_TOKEN_FILE_ENV } from "../sandbox/agent-tools";

/** The files of one browser sandbox, by absolute path. */
export interface AgentShellFiles {
  read(path: string): string | null;
  /** Names of the entries directly inside `dir` (files and directories). */
  list(dir: string): string[];
}

/** What the `api` command makes requests with: `fetch`, or a stand-in for it. */
export type AgentFetch = (input: URL | string, init?: RequestInit) => Promise<Response>;

export interface AgentShellContext {
  files: AgentShellFiles;
  /** The sandbox's environment, merged with the command's. */
  env: Record<string, string>;
  fetch: AgentFetch;
}

const HELP = "This sandbox runs the agent's tools: env, ls, cat and api <METHOD> <path>.\n";

/**
 * Runs one of the agent's commands in a browser sandbox. It is no shell: a
 * string command is split on whitespace (no quotes, pipes or variables) and
 * the first word must be one of the agent's tools.
 *
 * `api METHOD /path` calls the example API (`$SCHEMAVAULTS_API_BASE_URL`)
 * with the token in the file `$SCHEMAVAULTS_ACCESS_TOKEN_FILE` and prints the
 * response as `{"status": ..., "body": ...}`: exit code 0 for a 2xx, 1 for
 * another status, 2 for a misconfigured sandbox, 3 when the API is
 * unreachable. It sends no cookies, so the API only ever sees the agent's
 * own delegated token.
 */
export async function runAgentShell(command: NormalizedCommand, context: AgentShellContext): Promise<ExecResult> {
  const argv =
    command.cmd === "sh" && command.args[0] === "-c"
      ? (command.args[1] ?? "").trim().split(/\s+/).filter((word) => word.length > 0)
      : [command.cmd, ...command.args];
  const [name, ...args] = argv;
  const resolve = (path: string) => resolveSandboxPath(command.cwd, path);

  switch (name) {
    case undefined:
      return { exitCode: 0, stdout: "", stderr: "" };
    case "env":
      return {
        exitCode: 0,
        stdout: Object.keys(context.env)
          .sort()
          .map((key) => `${key}=${context.env[key]}\n`)
          .join(""),
        stderr: "",
      };
    case "ls": {
      const all = args.includes("-A") || args.includes("-a");
      const dir = resolve(args.find((arg) => !arg.startsWith("-")) ?? ".");
      const entries = context.files.list(dir).filter((entry) => all || !entry.startsWith("."));
      return { exitCode: 0, stdout: entries.map((entry) => `${entry}\n`).join(""), stderr: "" };
    }
    case "cat": {
      let stdout = "";
      for (const path of args) {
        const content = context.files.read(resolve(path));
        if (content === null) return { exitCode: 1, stdout, stderr: `cat: ${path}: No such file or directory\n` };
        stdout += content;
      }
      return { exitCode: 0, stdout, stderr: "" };
    }
    case "api":
      return callApi(args, context, resolve);
    case "help":
      return { exitCode: 0, stdout: HELP, stderr: "" };
    default:
      return { exitCode: 127, stdout: "", stderr: `${name}: command not found\n${HELP}` };
  }
}

async function callApi(
  args: string[],
  context: AgentShellContext,
  resolve: (path: string) => string,
): Promise<ExecResult> {
  const [method = "GET", path = "/"] = args;
  const base = context.env[AGENT_API_BASE_URL_ENV];
  const tokenFile = context.env[AGENT_TOKEN_FILE_ENV];
  const token = tokenFile ? context.files.read(resolve(tokenFile))?.trim() : undefined;
  if (!base || !token) {
    return {
      exitCode: 2,
      stdout: "",
      stderr: `api: ${AGENT_API_BASE_URL_ENV} and a token in ${AGENT_TOKEN_FILE_ENV} are required\n`,
    };
  }

  let response: Response;
  try {
    response = await context.fetch(new URL(path, base), {
      method: method.toUpperCase(),
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      credentials: "omit",
    });
  } catch (error: unknown) {
    return {
      exitCode: 3,
      stdout: "",
      stderr: `api: request to ${base} failed: ${error instanceof Error ? error.message : String(error)}\n`,
    };
  }
  const text = await response.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    // Not JSON: print it as text.
  }
  return {
    exitCode: response.ok ? 0 : 1,
    stdout: `${JSON.stringify({ status: response.status, body }, null, 2)}\n`,
    stderr: "",
  };
}
