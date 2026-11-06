import { describe, expect, test } from "bun:test";
import { AGENT_TOKEN_FILE } from "../sandbox/agent-tools";
import type { AgentSessionRecord, AgentSessionView, AgentTranscriptEntry } from "../runtime/types";
import type { AgentFetch } from "./agent-shell";
import { AgentSessionStore } from "./agent-session-store";
import { AgentSessionError, BrowserAgentRuntime } from "./browser-agent-runtime";
import { MemoryStorage } from "./memory-storage";

const OWNER = "00000000-0000-0000-0000-000000000000|user-1";

interface HarnessOptions {
  /** How long each minted token lives. */
  tokenLifetimeMs?: number;
  /** Thrown by the mint (the server's refusal). */
  mintError?: Error;
}

/**
 * A runtime over in-memory storage, a fake auth server (mint / revoke) and a
 * fake example API that refuses revoked tokens, as the real one does by
 * introspecting delegated tokens.
 */
function createHarness(options: HarnessOptions = {}) {
  const storage = new MemoryStorage();
  const minted: { scopes: readonly string[]; token: string }[] = [];
  const revoked = new Set<string>();
  const calls: { url: string; token: string; credentials: RequestCredentials | undefined }[] = [];

  const fakeApi: AgentFetch = async (input, init) => {
    const token = (new Headers(init?.headers).get("authorization") ?? "").replace(/^Bearer /, "");
    calls.push({ url: String(input), token, credentials: init?.credentials });
    if (!minted.some((grant) => grant.token === token)) return Response.json({ error: "invalid_token" }, { status: 401 });
    if (revoked.has(token)) return Response.json({ error: "token_revoked" }, { status: 401 });
    return Response.json({
      email: "user@example.com",
      scope: "openid email",
      actor: { sub: "service-account", client_id: "confidential-app" },
    });
  };

  const runtime = (ownerSub = OWNER) =>
    new BrowserAgentRuntime({
      ownerSub,
      storage,
      apiBaseUrl: "https://app.example",
      fetch: fakeApi,
      mintDelegatedToken: async (scopes) => {
        if (options.mintError) throw options.mintError;
        const token = `delegated-${minted.length + 1}`;
        minted.push({ scopes, token });
        return {
          access_token: token,
          scope: ["openid", ...scopes].join(" "),
          expires_at: Date.now() + (options.tokenLifetimeMs ?? 15 * 60_000),
        };
      },
      revokeDelegatedToken: async (token) => {
        revoked.add(token);
      },
    });

  return { storage, minted, revoked, calls, runtime };
}

function last<K extends AgentTranscriptEntry["kind"]>(
  session: AgentSessionView,
  kind: K,
): Extract<AgentTranscriptEntry, { kind: K }> {
  const entry = session.transcript.filter((e): e is Extract<AgentTranscriptEntry, { kind: K }> => e.kind === kind).at(-1);
  if (!entry) throw new Error(`No ${kind} entry in the transcript`);
  return entry;
}

describe("BrowserAgentRuntime", () => {
  test("starts a session: a delegated token for the picked scopes, a sandbox holding it, then the first turn", async () => {
    const { runtime, minted, calls } = createHarness();
    const agents = runtime();
    const session = await agents.start(["email", "not-offered"], "Who am I?");

    expect(minted).toEqual([{ scopes: ["email"], token: "delegated-1" }]);
    expect(session).toMatchObject({ status: "idle", credentialStatus: "active", scope: "openid email", ended: false });
    expect(session.transcript.map((entry) => entry.kind)).toEqual([
      "event",
      "event",
      "user",
      "assistant",
      "tool",
      "assistant",
    ]);
    expect(session.transcript[1]).toMatchObject({ text: expect.stringContaining("(browser provider)") });
    expect(last(session, "tool")).toMatchObject({ tool: "whoami", exitCode: 0 });
    expect(last(session, "assistant").text).toContain("You are user@example.com.");

    // The agent called the API from its sandbox with its own token, and no cookies.
    expect(calls).toEqual([{ url: "https://app.example/api/whoami", token: "delegated-1", credentials: "omit" }]);
    expect(await agents.manager.readTextFile(session.sandboxId ?? "", AGENT_TOKEN_FILE)).toBe("delegated-1");
    // The view never carries the token.
    expect(JSON.stringify(session)).not.toContain("delegated-1");
  });

  test("keeps each user's sessions in the browser, across page loads", async () => {
    const { runtime, storage } = createHarness();
    const started = await runtime().start([], "Who am I?");

    expect(runtime().list().map((session) => session.id)).toEqual([started.id]);
    expect(runtime("00000000-0000-0000-0000-000000000000|user-2").list()).toEqual([]);

    // A turn the page left running when it went away is over.
    const store = new AgentSessionStore(storage, OWNER);
    store.save({ ...(store.get(started.id) as AgentSessionRecord), status: "running" });
    expect(runtime().list()[0]?.status).toBe("idle");
  });

  test("refuses a second turn while the agent is working", async () => {
    const { runtime } = createHarness();
    const agents = runtime();
    const { id } = await agents.start([], "Who am I?");

    const turn = agents.send(id, "Who am I?");
    await expect(agents.send(id, "Who am I?")).rejects.toThrow("The agent is still working.");
    expect((await turn).status).toBe("idle");
  });

  test("cuts the agent off when its access is revoked, until it is granted again", async () => {
    const { runtime, revoked, minted } = createHarness();
    const agents = runtime();
    const { id } = await agents.start(["email"], "Who am I?");

    const afterRevoke = await agents.revoke(id);
    expect(revoked).toEqual(new Set(["delegated-1"]));
    expect(afterRevoke.credentialStatus).toBe("revoked");
    expect(last(afterRevoke, "event").text).toContain("You revoked the agent's access");

    const refused = await agents.send(id, "Who am I?");
    expect(last(refused, "tool").exitCode).toBe(1);
    expect(last(refused, "assistant").text).toContain("401 token_revoked");
    expect(refused.credentialStatus).toBe("revoked");

    const granted = await agents.grantAgain(id);
    expect(minted.at(-1)).toEqual({ scopes: ["email"], token: "delegated-2" });
    expect(granted.credentialStatus).toBe("active");
    expect(await agents.manager.readTextFile(granted.sandboxId ?? "", AGENT_TOKEN_FILE)).toBe("delegated-2");

    expect(last(await agents.send(id, "Who am I?"), "tool").exitCode).toBe(0);
  });

  test("marks a token the API turns away as rejected (e.g. after the user signed out)", async () => {
    const { runtime, revoked } = createHarness();
    const agents = runtime();
    const { id } = await agents.start([], "Who am I?");

    // Signing out revokes the sign-in's tokens at the auth server, the agent's included.
    revoked.add("delegated-1");
    const session = await agents.send(id, "Who am I?");
    expect(session.credentialStatus).toBe("rejected");
    expect(last(session, "assistant").text).toContain("Grant me access again");
  });

  test("ends a session: revokes its token and destroys its sandbox", async () => {
    const { runtime, revoked, storage } = createHarness();
    const agents = runtime();
    const { id, sandboxId } = await agents.start([], "Who am I?");

    const ended = await agents.end(id);
    expect(ended).toMatchObject({ ended: true, status: "completed", credentialStatus: "revoked" });
    expect(last(ended, "event").text).toBe(
      "Session ended: the agent's token no longer works, and its sandbox is destroyed.",
    );
    expect(revoked).toEqual(new Set(["delegated-1"]));
    expect(storage.keys().filter((key) => key.includes(sandboxId ?? "missing"))).toEqual([]);

    await expect(agents.send(id, "Who am I?")).rejects.toThrow(AgentSessionError);
    await expect(agents.grantAgain(id)).rejects.toThrow("This agent session has ended.");
    expect((await agents.end(id)).transcript).toHaveLength(ended.transcript.length);
  });

  test("fails a session whose token the server won't mint, with no sandbox", async () => {
    const { runtime, revoked, storage } = createHarness({
      mintError: new AgentSessionError("Your sign-in has ended; sign in again."),
    });
    const session = await runtime().start([], "Who am I?");

    expect(session).toMatchObject({ status: "failed", sandboxId: null, credentialStatus: null });
    expect(last(session, "event").text).toBe("Couldn't start the agent: Your sign-in has ended; sign in again.");
    expect(revoked.size).toBe(0);
    expect(storage.keys().filter((key) => key.includes("sandbox"))).toEqual([]);
  });

  test("renews a token about to expire before the agent's next turn", async () => {
    const { runtime, minted } = createHarness({ tokenLifetimeMs: 30_000 });
    const agents = runtime();
    const { id } = await agents.start([], "Who am I?");

    const session = await agents.send(id, "Who am I?");
    expect(minted.map((grant) => grant.token)).toEqual(["delegated-1", "delegated-2"]);
    expect(session.transcript.some((entry) => entry.kind === "event" && entry.text.startsWith("Renewed"))).toBe(true);
    expect(await agents.manager.readTextFile(session.sandboxId ?? "", AGENT_TOKEN_FILE)).toBe("delegated-2");
    expect(last(session, "tool").exitCode).toBe(0);
  });
});

describe("BrowserAgentRuntime outside a secure context", () => {
  test("runs on plain-http hosts, where browsers offer no crypto.randomUUID()", async () => {
    const own = Object.getOwnPropertyDescriptor(crypto, "randomUUID");
    Object.defineProperty(crypto, "randomUUID", { value: undefined, configurable: true, writable: true });
    try {
      expect(() => crypto.randomUUID()).toThrow();
      const session = await createHarness().runtime().start([], "Who am I?");
      expect(session.status).toBe("idle");
      expect(session.id).toMatch(/^agent-[0-9a-f]{32}$/);
      expect(session.sandboxId).toMatch(/^sbx-[0-9a-f]{32}$/);
      expect(new Set(session.transcript.map((entry) => entry.id)).size).toBe(session.transcript.length);
    } finally {
      if (own) Object.defineProperty(crypto, "randomUUID", own);
      else delete (crypto as { randomUUID?: unknown }).randomUUID;
    }
  });
});
