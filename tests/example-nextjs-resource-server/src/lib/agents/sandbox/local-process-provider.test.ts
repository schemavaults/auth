import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { InMemorySandboxStore, SandboxManager } from "@schemavaults/sandbox-management-sdk";
import { LocalProcessSandboxProvider } from "./local-process-provider";
import {
  AGENT_API_BASE_URL_ENV,
  AGENT_API_TOOL_PATH,
  AGENT_API_TOOL_SOURCE,
  AGENT_TOKEN_FILE,
  AGENT_TOKEN_FILE_ENV,
  agentApiCommand,
  parseAgentApiToolOutput,
} from "./agent-tools";

let rootDir = "";

beforeAll(async () => {
  rootDir = await mkdtemp(path.join(os.tmpdir(), "local-process-provider-test-"));
});

afterAll(async () => {
  await rm(rootDir, { recursive: true, force: true });
});

function createManager(): SandboxManager {
  return new SandboxManager({
    providers: [new LocalProcessSandboxProvider({ rootDir })],
    store: new InMemorySandboxStore(),
  });
}

describe("LocalProcessSandboxProvider through SandboxManager", () => {
  test("runs commands in the sandbox's own workdir with only its environment", async () => {
    process.env.EXAMPLE_HOST_SECRET = "must-not-leak";
    try {
      const manager = createManager();
      const sandbox = await manager.create({ spec: { env: { GREETING: "hello" } } });
      expect(sandbox.status).toBe("running");

      const result = await manager.exec(sandbox.id, "pwd && echo $GREETING && env");
      expect(result.exitCode).toBe(0);
      const [workdir, greeting] = result.stdout.split("\n");
      expect(workdir).toBe(path.join(rootDir, `local-${sandbox.id}`, "workspace"));
      expect(greeting).toBe("hello");
      expect(result.stdout).toContain("GREETING=hello");
      expect(result.stdout).not.toContain("EXAMPLE_HOST_SECRET");
      expect(result.stdout).not.toContain("must-not-leak");
    } finally {
      delete process.env.EXAMPLE_HOST_SECRET;
    }
  });

  test("keeps files inside the sandbox, whatever path they are given", async () => {
    const manager = createManager();
    const sandbox = await manager.create({ spec: {} });
    await manager.writeFiles(sandbox.id, [
      { path: AGENT_TOKEN_FILE, content: "token", mode: 0o600 },
      { path: "../../../escape.txt", content: "still inside" },
    ]);
    const sandboxRoot = path.join(rootDir, `local-${sandbox.id}`);
    expect(await manager.readTextFile(sandbox.id, AGENT_TOKEN_FILE)).toBe("token");
    expect((await stat(path.join(sandboxRoot, "workspace", AGENT_TOKEN_FILE))).mode & 0o777).toBe(0o600);
    expect(await manager.readTextFile(sandbox.id, "/escape.txt")).toBe("still inside");
    expect(await readdir(rootDir)).not.toContain("escape.txt");
    expect(await manager.readFile(sandbox.id, "missing.txt")).toBeNull();
  });

  test("stops, resumes on the next command, and is deleted on destroy", async () => {
    const manager = createManager();
    const sandbox = await manager.create({ spec: {} });
    expect((await manager.stop(sandbox.id)).status).toBe("stopped");
    expect((await manager.exec(sandbox.id, "echo back")).stdout).toBe("back\n");
    expect((await manager.get(sandbox.id)).status).toBe("running");

    expect((await manager.destroy(sandbox.id)).status).toBe("destroyed");
    expect(await readdir(rootDir)).not.toContain(`local-${sandbox.id}`);
  });

  test("refuses what it cannot do: a main process, and network restrictions", async () => {
    const manager = createManager();
    expect(manager.create({ spec: { start: "sleep 60" } })).rejects.toThrow("one-shot commands only");
    expect(manager.create({ spec: { network: "deny-all" } })).rejects.toThrow();
  });
});

describe("the agent's API tool", () => {
  test("calls the API with the token from the sandbox's file and prints the response", async () => {
    const server = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch: (request) =>
        Response.json(
          {
            method: request.method,
            path: new URL(request.url).pathname,
            authorization: request.headers.get("authorization"),
          },
          { status: new URL(request.url).pathname === "/api/me/account-deletion" ? 403 : 200 },
        ),
    });
    try {
      const manager = createManager();
      const sandbox = await manager.create({
        spec: {
          env: {
            [AGENT_API_BASE_URL_ENV]: `http://127.0.0.1:${server.port}`,
            [AGENT_TOKEN_FILE_ENV]: AGENT_TOKEN_FILE,
          },
        },
      });
      await manager.writeFiles(sandbox.id, [
        { path: AGENT_API_TOOL_PATH, content: AGENT_API_TOOL_SOURCE },
        { path: AGENT_TOKEN_FILE, content: "delegated-token\n", mode: 0o600 },
      ]);

      const ok = await manager.exec(sandbox.id, agentApiCommand("GET", "/api/whoami"));
      expect(ok.exitCode).toBe(0);
      expect(parseAgentApiToolOutput(ok.stdout)).toEqual({
        status: 200,
        body: { method: "GET", path: "/api/whoami", authorization: "Bearer delegated-token" },
      });

      const refused = await manager.exec(sandbox.id, agentApiCommand("POST", "/api/me/account-deletion"));
      expect(refused.exitCode).toBe(1);
      expect(parseAgentApiToolOutput(refused.stdout)?.status).toBe(403);
    } finally {
      server.stop(true);
    }
  });
});
