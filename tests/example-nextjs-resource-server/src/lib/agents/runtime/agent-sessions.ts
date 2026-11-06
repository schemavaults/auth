import "server-only";
import { AGENT_SCOPE_OPTIONS } from "../scopes";
import { createAgentSandbox, writeAgentAccessToken } from "../sandbox/agent-sandbox";
import {
  credentialNeedsRenewal,
  describeAuthServerError,
  mintDelegatedCredential,
  revokeDelegatedCredential,
} from "./delegated-credential";
import { appendEntry, runAgentTurn } from "./run-agent-turn";
import { agentsState, getAgentSandboxManager, type AgentAppUser } from "./state";
import { toAgentSessionView, type AgentCredential, type AgentSessionRecord, type AgentSessionView } from "./types";

export class AgentSessionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentSessionError";
  }
}

function ownedSession(user: AgentAppUser, sessionId: string): AgentSessionRecord {
  const record = agentsState().sessions.get(sessionId);
  if (!record || record.owner_sub !== user.sub) throw new AgentSessionError("No such agent session.");
  return record;
}

function describeCredential(credential: AgentCredential): string {
  const until = new Date(credential.expires_at).toISOString().slice(11, 16);
  return `scope \`${credential.scope || "(none)"}\`, valid until ${until} UTC (when your own token expires)`;
}

/** Mints the session's credential and puts it in its sandbox, if it has one. */
async function grantCredential(user: AgentAppUser, record: AgentSessionRecord): Promise<void> {
  record.credential = await mintDelegatedCredential(user, record.requested_scopes);
  if (record.sandbox_id) {
    await writeAgentAccessToken(getAgentSandboxManager(), record.sandbox_id, record.credential.access_token);
  }
}

export function listAgentSessions(user: AgentAppUser): AgentSessionView[] {
  return [...agentsState().sessions.values()]
    .filter((record) => record.owner_sub === user.sub)
    .sort((a, b) => b.updated_at - a.updated_at)
    .map(toAgentSessionView);
}

export interface StartAgentSessionOptions {
  /** The scopes the user picked (a subset of AGENT_SCOPE_OPTIONS). */
  scopes: readonly string[];
  prompt: string;
  /** Where the agent reaches the example API from its sandbox. */
  apiBaseUrl: string;
}

/**
 * Starts an agent session: a delegated token narrowed to the picked scopes,
 * a sandbox holding it, then the first turn on `prompt`.
 */
export async function startAgentSession(
  user: AgentAppUser,
  { scopes, prompt, apiBaseUrl }: StartAgentSessionOptions,
): Promise<AgentSessionView> {
  const offered = new Set(AGENT_SCOPE_OPTIONS.map((option) => option.scope));
  const now = Date.now();
  const record: AgentSessionRecord = {
    id: `agent-${crypto.randomUUID()}`,
    owner_sub: user.sub,
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
  agentsState().sessions.set(record.id, record);

  const manager = getAgentSandboxManager();
  try {
    await grantCredential(user, record);
    const credential: AgentCredential | null = record.credential;
    if (!credential) throw new AgentSessionError("No delegated token was minted.");
    appendEntry(record, {
      kind: "event",
      tone: "info",
      text: `Minted a delegated token: the app's service account acts for you with ${describeCredential(credential)}.`,
    });
    const sandbox = await createAgentSandbox({
      manager,
      agentSessionId: record.id,
      ownerId: user.sub,
      apiBaseUrl,
      accessToken: credential.access_token,
    });
    record.sandbox_id = sandbox.id;
    appendEntry(record, {
      kind: "event",
      tone: "info",
      text: `Started sandbox \`${sandbox.id}\` (${sandbox.provider} provider). The agent's tools run there, holding only its own token.`,
    });
  } catch (e: unknown) {
    if (record.credential?.status === "active") {
      await revokeDelegatedCredential(record.credential).catch(() => undefined);
    }
    record.status = "failed";
    appendEntry(record, {
      kind: "event",
      tone: "destructive",
      text: `Couldn't start the agent: ${describeAuthServerError(e)}`,
    });
    return toAgentSessionView(record);
  }

  await runAgentTurn(manager, record, prompt);
  record.status = "idle";
  return toAgentSessionView(record);
}

/** Runs a turn in an existing session, renewing its token if it is about to expire. */
export async function sendAgentMessage(
  user: AgentAppUser,
  sessionId: string,
  prompt: string,
): Promise<AgentSessionView> {
  const record = ownedSession(user, sessionId);
  if (record.ended) throw new AgentSessionError("This agent session has ended.");
  if (record.status === "running") throw new AgentSessionError("The agent is still working.");
  record.status = "running";
  try {
    if (record.credential && credentialNeedsRenewal(record.credential)) {
      await grantCredential(user, record);
      if (record.credential) {
        appendEntry(record, {
          kind: "event",
          tone: "info",
          text: `Renewed the agent's delegated token: ${describeCredential(record.credential)}.`,
        });
      }
    }
    await runAgentTurn(getAgentSandboxManager(), record, prompt);
  } catch (e: unknown) {
    appendEntry(record, { kind: "event", tone: "destructive", text: `The agent failed: ${describeAuthServerError(e)}` });
  } finally {
    record.status = "idle";
  }
  return toAgentSessionView(record);
}

/** Revokes the agent's token: the API refuses the agent from now on. */
export async function revokeAgentAccess(user: AgentAppUser, sessionId: string): Promise<AgentSessionView> {
  const record = ownedSession(user, sessionId);
  if (record.credential?.status === "active") {
    try {
      await revokeDelegatedCredential(record.credential);
    } catch (e: unknown) {
      throw new AgentSessionError(`Couldn't revoke the agent's token: ${describeAuthServerError(e)}`);
    }
    appendEntry(record, {
      kind: "event",
      tone: "warning",
      text: "You revoked the agent's access: its token is revoked at the auth server, so the API refuses it from now on.",
    });
  }
  return toAgentSessionView(record);
}

/** Gives the agent a fresh delegated token (same scopes) from the user's current sign-in. */
export async function grantAgentAccessAgain(user: AgentAppUser, sessionId: string): Promise<AgentSessionView> {
  const record = ownedSession(user, sessionId);
  if (record.ended || !record.sandbox_id) throw new AgentSessionError("This agent session has ended.");
  try {
    await grantCredential(user, record);
  } catch (e: unknown) {
    throw new AgentSessionError(`Couldn't grant the agent access: ${describeAuthServerError(e)}`);
  }
  if (record.credential) {
    appendEntry(record, {
      kind: "event",
      tone: "info",
      text: `Granted the agent access again: a new delegated token with ${describeCredential(record.credential)}.`,
    });
  }
  return toAgentSessionView(record);
}

/** Ends a session: revokes the agent's token and destroys its sandbox. */
export async function endAgentSession(user: AgentAppUser, sessionId: string): Promise<AgentSessionView> {
  const record = ownedSession(user, sessionId);
  if (record.ended) return toAgentSessionView(record);
  if (record.credential?.status === "active") {
    await revokeDelegatedCredential(record.credential).catch((e: unknown) =>
      console.error("[agents] Revoking an agent's token failed", e),
    );
  }
  if (record.sandbox_id) {
    await getAgentSandboxManager()
      .destroy(record.sandbox_id)
      .catch((e: unknown) => console.error("[agents] Destroying an agent's sandbox failed", e));
  }
  record.ended = true;
  record.status = "completed";
  const token =
    record.credential?.status === "active"
      ? "revoking the agent's token failed (it still expires with your own)"
      : "the agent's token no longer works";
  appendEntry(record, {
    kind: "event",
    tone: "info",
    text: `Session ended: ${token}, and its sandbox is destroyed.`,
  });
  return toAgentSessionView(record);
}
