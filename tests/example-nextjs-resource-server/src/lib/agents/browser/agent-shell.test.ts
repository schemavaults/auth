import { describe, expect, test } from "bun:test";
import { normalizeCommand } from "@schemavaults/sandbox-management-sdk";
import {
  AGENT_API_BASE_URL_ENV,
  AGENT_TOKEN_FILE,
  AGENT_TOKEN_FILE_ENV,
  agentApiCommand,
  parseAgentApiToolOutput,
} from "../sandbox/agent-tools";
import { runAgentShell, type AgentFetch, type AgentShellContext } from "./agent-shell";

const WORKDIR = "/workspace";

interface SentRequest {
  url: string;
  method: string | undefined;
  authorization: string | null;
  credentials: RequestCredentials | undefined;
}

function shell(options: { files?: Record<string, string>; env?: Record<string, string>; fetch?: AgentFetch } = {}) {
  const files: Record<string, string> = options.files ?? { [`${WORKDIR}/${AGENT_TOKEN_FILE}`]: "agent-token\n" };
  const sent: SentRequest[] = [];
  const context: AgentShellContext = {
    files: {
      read: (path) => files[path] ?? null,
      list: (dir) => [
        ...new Set(
          Object.keys(files)
            .filter((path) => path.startsWith(`${dir}/`))
            .map((path) => path.slice(dir.length + 1).split("/")[0] ?? ""),
        ),
      ],
    },
    env: options.env ?? {
      [AGENT_API_BASE_URL_ENV]: "https://app.example",
      [AGENT_TOKEN_FILE_ENV]: AGENT_TOKEN_FILE,
      HOME: "/home/agent",
    },
    fetch:
      options.fetch ??
      (async (input, init) => {
        sent.push({
          url: String(input),
          method: init?.method,
          authorization: new Headers(init?.headers).get("authorization"),
          credentials: init?.credentials,
        });
        return Response.json({ ok: true });
      }),
  };
  return { sent, run: (command: string) => runAgentShell(normalizeCommand(command, WORKDIR), context) };
}

describe("runAgentShell", () => {
  test("prints the sandbox's environment, sorted", async () => {
    const result = await shell().run("env");
    expect(result).toEqual({
      exitCode: 0,
      stdout: `HOME=/home/agent\n${AGENT_TOKEN_FILE_ENV}=${AGENT_TOKEN_FILE}\n${AGENT_API_BASE_URL_ENV}=https://app.example\n`,
      stderr: "",
    });
  });

  test("lists and reads the sandbox's files", async () => {
    const { run } = shell({
      files: { [`${WORKDIR}/${AGENT_TOKEN_FILE}`]: "agent-token\n", [`${WORKDIR}/notes.txt`]: "hello\n" },
    });
    expect((await run("ls")).stdout).toBe("notes.txt\n");
    expect((await run("ls -A")).stdout).toBe(".agent\nnotes.txt\n");
    expect((await run("ls -A .agent")).stdout).toBe("access-token\n");
    expect(await run("cat notes.txt")).toEqual({ exitCode: 0, stdout: "hello\n", stderr: "" });
    expect(await run(`cat ${WORKDIR}/notes.txt`)).toMatchObject({ exitCode: 0, stdout: "hello\n" });
    expect(await run("cat missing.txt")).toMatchObject({ exitCode: 1, stderr: "cat: missing.txt: No such file or directory\n" });
  });

  test("calls the API with the sandbox's own token, and no cookies", async () => {
    const { run, sent } = shell();
    const result = await run(agentApiCommand("GET", "/api/whoami"));

    expect(sent).toEqual([
      {
        url: "https://app.example/api/whoami",
        method: "GET",
        authorization: "Bearer agent-token",
        credentials: "omit",
      },
    ]);
    expect(result.exitCode).toBe(0);
    expect(parseAgentApiToolOutput(result.stdout)).toEqual({ status: 200, body: { ok: true } });
  });

  test("exits 1 when the API refuses, printing its answer", async () => {
    const { run } = shell({
      fetch: async () => Response.json({ error: "token_revoked" }, { status: 401 }),
    });
    const result = await run(agentApiCommand("POST", "/api/me/account-deletion"));
    expect(result.exitCode).toBe(1);
    expect(parseAgentApiToolOutput(result.stdout)).toEqual({ status: 401, body: { error: "token_revoked" } });
  });

  test("prints a body that isn't JSON as text", async () => {
    const { run } = shell({ fetch: async () => new Response("Bad gateway", { status: 502 }) });
    expect(parseAgentApiToolOutput((await run("api GET /api/health")).stdout)).toEqual({
      status: 502,
      body: "Bad gateway",
    });
  });

  test("exits 3 when the API is unreachable, and 2 without a token", async () => {
    const unreachable = shell({
      fetch: async () => {
        throw new TypeError("Failed to fetch");
      },
    });
    expect(await unreachable.run("api GET /api/whoami")).toMatchObject({ exitCode: 3, stdout: "" });

    const tokenless = shell({ files: {} });
    expect(await tokenless.run("api GET /api/whoami")).toMatchObject({ exitCode: 2, stdout: "" });
    expect(tokenless.sent).toEqual([]);
  });

  test("runs nothing but the agent's tools: no shell, no other programs", async () => {
    const { run, sent } = shell();
    expect((await run("rm -rf /")).exitCode).toBe(127);
    expect((await run("curl https://evil.example")).exitCode).toBe(127);
    // No shell syntax: `env;` is not `env`, so nothing after it runs either.
    expect(await run("env; cat .agent/access-token")).toMatchObject({ exitCode: 127, stdout: "" });
    expect(await runAgentShell({ cmd: "node", args: ["-e", "1"], cwd: WORKDIR, env: {} }, {
      files: { read: () => null, list: () => [] },
      env: {},
      fetch,
    })).toMatchObject({ exitCode: 127 });
    expect((await run("help")).stdout).toContain("api <METHOD> <path>");
    expect(sent).toEqual([]);
  });
});
