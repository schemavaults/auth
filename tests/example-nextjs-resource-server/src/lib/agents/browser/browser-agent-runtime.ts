// NOT server-only: runs in the browser (unit tested).

import { SandboxManager } from "@schemavaults/sandbox-management-sdk";
import { WebStorageSandboxStore, type WebStorageLike } from "@schemavaults/sandbox-management-sdk/web-storage";
import { AGENT_SCOPE_OPTIONS } from "../scopes";
import { AGENT_API_BASE_URL_ENV, AGENT_TOKEN_FILE, AGENT_TOKEN_FILE_ENV } from "../sandbox/agent-tools";
import {
  toAgentSessionView,
  type AgentCredential,
  type AgentSessionRecord,
  type AgentSessionView,
  type DelegatedTokenGrant,
} from "../runtime/types";
import type { AgentFetch } from "./agent-shell";
import { AgentSessionStore } from "./agent-session-store";
import { BrowserSandboxProvider } from "./browser-sandbox-provider";
import { randomId } from "./random-id";
import { appendEntry, runAgentTurn } from "./run-agent-turn";

/** A refusal to show the user as is (a missing session, a busy agent, the auth server's answer). */
export class AgentSessionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentSessionError";
  }
}

export interface BrowserAgentRuntimeOptions {
  /** OIDC `sub` of the signed-in user: whose sessions these are. */
  ownerSub: string;
  /** Where sessions and sandboxes are kept, e.g. `localStorage`. */
  storage: WebStorageLike;
  /** Where the agent reaches the example API: this app's own origin. */
  apiBaseUrl: string;
  /** Asks the app's server to exchange the user's token for a delegated one (throws AgentSessionError). */
  mintDelegatedToken: (scopes: readonly string[]) => Promise<DelegatedTokenGrant>;
  /** Asks the app's server to revoke a delegated token (throws AgentSessionError). */
  revokeDelegatedToken: (token: string) => Promise<void>;
  /** What the agents call the API with. Default: the global `fetch`. */
  fetch?: AgentFetch;
}

/** Renew a delegated token this long before it expires. */
const RENEW_BEFORE_EXPIRY_MS = 60_000;

/**
 * The agents app in the user's browser: sessions, transcripts and sandboxes
 * live here (Web Storage, through a real `SandboxManager`), and the app's
 * server only does what needs its client secret: minting and revoking the
 * agents' delegated tokens. Nothing is kept on the server between requests.
 */
export class BrowserAgentRuntime {
  readonly manager: SandboxManager;
  private readonly sandboxes: WebStorageSandboxStore;
  private readonly sessions: AgentSessionStore;

  constructor(private readonly options: BrowserAgentRuntimeOptions) {
    this.sandboxes = new WebStorageSandboxStore({ storage: options.storage, prefix: "example-agents:sandboxes:" });
    this.manager = new SandboxManager({
      providers: [new BrowserSandboxProvider({ storage: options.storage, fetch: options.fetch })],
      store: this.sandboxes,
      // The SDK's default ids come from crypto.randomUUID(): secure contexts only (see random-id.ts).
      generateId: () => `sbx-${randomId()}`,
    });
    this.sessions = new AgentSessionStore(options.storage, options.ownerSub);
    // A turn that was running when the page went away will never finish.
    for (const record of this.sessions.list()) {
      if (record.status === "running") this.sessions.save({ ...record, status: "idle" });
    }
  }

  list(): AgentSessionView[] {
    return this.sessions
      .list()
      .sort((a, b) => b.updated_at - a.updated_at)
      .map(toAgentSessionView);
  }

  /** Starts a session: a delegated token narrowed to the picked scopes, a sandbox holding it, then the first turn. */
  async start(scopes: readonly string[], prompt: string): Promise<AgentSessionView> {
    const offered = new Set(AGENT_SCOPE_OPTIONS.map((option) => option.scope));
    const now = Date.now();
    const record: AgentSessionRecord = {
      id: `agent-${randomId()}`,
      owner_sub: this.options.ownerSub,
      title: prompt.length > 60 ? `${prompt.slice(0, 57)}…` : prompt,
      requested_scopes: scopes.filter((scope) => offered.has(scope)),
      created_at: now,
      updated_at: now,
      status: "running",
      sandbox_id: null,
      credential: null,
      transcript: [],
      ended: false,
    };
    this.sessions.save(record);

    try {
      const credential = await this.mint(record);
      appendEntry(record, {
        kind: "event",
        tone: "info",
        text: `Minted a delegated token: the app's service account acts for you with ${describeCredential(credential)}.`,
      });
      const sandbox = await this.manager.create({
        spec: {
          env: {
            [AGENT_API_BASE_URL_ENV]: this.options.apiBaseUrl,
            [AGENT_TOKEN_FILE_ENV]: AGENT_TOKEN_FILE,
          },
        },
        ownerId: this.options.ownerSub,
        labels: { app: "example-agents", "agent-session": record.id },
      });
      record.sandbox_id = sandbox.id;
      await this.writeToken(record);
      appendEntry(record, {
        kind: "event",
        tone: "info",
        text: `Started sandbox \`${sandbox.id}\` in your browser (${sandbox.provider} provider). The agent's tools run there, holding only its own token.`,
      });
    } catch (e: unknown) {
      if (record.credential?.status === "active") {
        await this.options.revokeDelegatedToken(record.credential.access_token).catch(() => undefined);
        record.credential.status = "revoked";
      }
      record.status = "failed";
      appendEntry(record, { kind: "event", tone: "destructive", text: `Couldn't start the agent: ${messageOf(e)}` });
      this.sessions.save(record);
      return toAgentSessionView(record);
    }

    await this.turn(record, prompt);
    return toAgentSessionView(record);
  }

  /** Runs a turn in an existing session, renewing its token if it is about to expire. */
  async send(sessionId: string, prompt: string): Promise<AgentSessionView> {
    const record = this.owned(sessionId);
    if (record.ended) throw new AgentSessionError("This agent session has ended.");
    if (record.status === "running") throw new AgentSessionError("The agent is still working.");
    record.status = "running";
    this.sessions.save(record);
    try {
      const credential = record.credential;
      if (credential?.status === "active" && credential.expires_at - Date.now() < RENEW_BEFORE_EXPIRY_MS) {
        const renewed = await this.mint(record);
        await this.writeToken(record);
        appendEntry(record, {
          kind: "event",
          tone: "info",
          text: `Renewed the agent's delegated token: ${describeCredential(renewed)}.`,
        });
      }
    } catch (e: unknown) {
      appendEntry(record, { kind: "event", tone: "destructive", text: `The agent failed: ${messageOf(e)}` });
      record.status = "idle";
      this.sessions.save(record);
      return toAgentSessionView(record);
    }
    await this.turn(record, prompt);
    return toAgentSessionView(record);
  }

  /** Revokes the agent's token: the API refuses the agent from now on. */
  async revoke(sessionId: string): Promise<AgentSessionView> {
    const record = this.owned(sessionId);
    if (record.credential?.status === "active") {
      await this.options.revokeDelegatedToken(record.credential.access_token);
      record.credential.status = "revoked";
      appendEntry(record, {
        kind: "event",
        tone: "warning",
        text: "You revoked the agent's access: its token is revoked at the auth server, so the API refuses it from now on.",
      });
      this.sessions.save(record);
    }
    return toAgentSessionView(record);
  }

  /** Gives the agent a fresh delegated token (same scopes) from the user's current sign-in. */
  async grantAgain(sessionId: string): Promise<AgentSessionView> {
    const record = this.owned(sessionId);
    if (record.ended || !record.sandbox_id) throw new AgentSessionError("This agent session has ended.");
    const credential = await this.mint(record);
    await this.writeToken(record);
    appendEntry(record, {
      kind: "event",
      tone: "info",
      text: `Granted the agent access again: a new delegated token with ${describeCredential(credential)}.`,
    });
    this.sessions.save(record);
    return toAgentSessionView(record);
  }

  /** Ends a session: revokes the agent's token and destroys its sandbox. */
  async end(sessionId: string): Promise<AgentSessionView> {
    const record = this.owned(sessionId);
    if (record.ended) return toAgentSessionView(record);
    record.ended = true;
    record.status = "completed";
    if (record.credential?.status === "active") {
      try {
        await this.options.revokeDelegatedToken(record.credential.access_token);
        record.credential.status = "revoked";
      } catch {
        // Reported below: the token still expires with the user's own.
      }
    }
    if (record.sandbox_id) {
      await this.manager.destroy(record.sandbox_id).catch(() => undefined);
      await this.sandboxes.delete(record.sandbox_id);
    }
    const token =
      record.credential?.status === "active"
        ? "revoking the agent's token failed (it still expires with your own)"
        : "the agent's token no longer works";
    appendEntry(record, { kind: "event", tone: "info", text: `Session ended: ${token}, and its sandbox is destroyed.` });
    this.sessions.save(record);
    return toAgentSessionView(record);
  }

  private owned(sessionId: string): AgentSessionRecord {
    const record = this.sessions.get(sessionId);
    if (!record) throw new AgentSessionError("No such agent session.");
    return record;
  }

  private async mint(record: AgentSessionRecord): Promise<AgentCredential> {
    const grant = await this.options.mintDelegatedToken(record.requested_scopes);
    record.credential = { ...grant, status: "active" };
    return record.credential;
  }

  /** Puts the session's token in its sandbox, where the agent's `api` command reads it. */
  private async writeToken(record: AgentSessionRecord): Promise<void> {
    if (!record.sandbox_id || !record.credential) return;
    await this.manager.writeFiles(record.sandbox_id, [
      { path: AGENT_TOKEN_FILE, content: record.credential.access_token, mode: 0o600 },
    ]);
  }

  private async turn(record: AgentSessionRecord, prompt: string): Promise<void> {
    const sandboxId = record.sandbox_id;
    await runAgentTurn(record, prompt, (command) =>
      sandboxId
        ? this.manager.exec(sandboxId, command)
        : Promise.reject(new AgentSessionError("The agent has no sandbox.")),
    );
    record.status = "idle";
    this.sessions.save(record);
  }
}

function describeCredential(credential: AgentCredential): string {
  const until = new Date(credential.expires_at).toISOString().slice(11, 16);
  return `scope \`${credential.scope || "(none)"}\`, valid until ${until} UTC (when your own token expires)`;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
