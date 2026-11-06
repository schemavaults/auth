import { describe, expect, test } from "bun:test";
import { SandboxManager } from "@schemavaults/sandbox-management-sdk";
import { WebStorageSandboxStore } from "@schemavaults/sandbox-management-sdk/web-storage";
import { AGENT_API_BASE_URL_ENV, AGENT_TOKEN_FILE, AGENT_TOKEN_FILE_ENV, parseAgentApiToolOutput } from "../sandbox/agent-tools";
import type { AgentFetch } from "./agent-shell";
import { BrowserSandboxProvider } from "./browser-sandbox-provider";
import { MemoryStorage } from "./memory-storage";

const STATE_PREFIX = "example-agents:sandbox-state:";

/** A manager over `storage`, as the page makes one on each load. */
function createManager(storage: MemoryStorage, fetchImpl?: AgentFetch): SandboxManager {
  return new SandboxManager({
    providers: [new BrowserSandboxProvider({ storage, fetch: fetchImpl })],
    store: new WebStorageSandboxStore({ storage, prefix: "example-agents:sandboxes:" }),
  });
}

describe("BrowserSandboxProvider through SandboxManager", () => {
  test("keeps a sandbox's files and environment in Web Storage, across page loads", async () => {
    const storage = new MemoryStorage();
    const sandbox = await createManager(storage).create({
      spec: { env: { [AGENT_API_BASE_URL_ENV]: "https://app.example", [AGENT_TOKEN_FILE_ENV]: AGENT_TOKEN_FILE } },
    });
    expect(sandbox.provider).toBe("browser");
    expect(sandbox.status).toBe("running");
    await createManager(storage).writeFiles(sandbox.id, [{ path: AGENT_TOKEN_FILE, content: "agent-token", mode: 0o600 }]);

    const reloaded = createManager(storage);
    expect(await reloaded.readTextFile(sandbox.id, AGENT_TOKEN_FILE)).toBe("agent-token");
    expect(await reloaded.exec(sandbox.id, `cat ${AGENT_TOKEN_FILE}`)).toMatchObject({ exitCode: 0, stdout: "agent-token" });
    expect((await reloaded.exec(sandbox.id, "env")).stdout).toBe(
      [
        "HOME=/home/agent",
        "PWD=/workspace",
        `${AGENT_TOKEN_FILE_ENV}=${AGENT_TOKEN_FILE}`,
        `${AGENT_API_BASE_URL_ENV}=https://app.example`,
        "",
      ].join("\n"),
    );
  });

  test("runs the agent's API tool with the token in its sandbox", async () => {
    const storage = new MemoryStorage();
    const authorizations: (string | null)[] = [];
    const manager = createManager(storage, async (_input, init) => {
      authorizations.push(new Headers(init?.headers).get("authorization"));
      return Response.json({ email: "user@example.com" });
    });
    const sandbox = await manager.create({
      spec: { env: { [AGENT_API_BASE_URL_ENV]: "https://app.example", [AGENT_TOKEN_FILE_ENV]: AGENT_TOKEN_FILE } },
    });
    await manager.writeFiles(sandbox.id, [{ path: AGENT_TOKEN_FILE, content: "agent-token" }]);

    const result = await manager.exec(sandbox.id, "api GET /api/me/email");
    expect(result.exitCode).toBe(0);
    expect(parseAgentApiToolOutput(result.stdout)).toEqual({ status: 200, body: { email: "user@example.com" } });
    expect(authorizations).toEqual(["Bearer agent-token"]);
  });

  test("stops, wakes and destroys sandboxes, leaving nothing in storage", async () => {
    const storage = new MemoryStorage();
    const manager = createManager(storage);
    const sandbox = await manager.create({ spec: {} });
    await manager.writeFiles(sandbox.id, [{ path: "file.txt", content: "kept" }]);

    expect((await manager.stop(sandbox.id)).status).toBe("stopped");
    // A stopped sandbox wakes when used, its files intact.
    expect(await manager.exec(sandbox.id, "cat file.txt")).toMatchObject({ exitCode: 0, stdout: "kept" });
    expect((await manager.get(sandbox.id)).status).toBe("running");

    expect((await manager.destroy(sandbox.id)).status).toBe("destroyed");
    expect(storage.keys().filter((key) => key.startsWith(STATE_PREFIX))).toEqual([]);
  });

  test("runs one-shot commands only: no main process", async () => {
    const manager = createManager(new MemoryStorage());
    await expect(manager.create({ spec: { start: "sleep 60" } })).rejects.toThrow("one-shot");
  });
});
