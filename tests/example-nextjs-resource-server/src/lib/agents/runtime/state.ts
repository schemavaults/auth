import "server-only";
import type { SandboxManager } from "@schemavaults/sandbox-management-sdk";
import { createAgentSandboxManager } from "../sandbox/agent-sandbox";
import type { AgentSessionRecord } from "./types";

/**
 * A user signed in to the agents app: their tokens for the example API, held
 * here on the server (the browser only gets an opaque session id cookie).
 * The access token is what each agent session's delegated token is exchanged
 * from; the refresh token renews it and, revoked at sign-out, ends every
 * token of this sign-in, agents' included.
 */
export interface AgentAppUser {
  /** Session id: the value of the session cookie. */
  id: string;
  /** OIDC subject `<auth_server_app_id>|<uid>`. */
  sub: string;
  email: string | null;
  access_token: string;
  /** Unix milliseconds. */
  access_token_expires_at: number;
  refresh_token: string | null;
  /** The scope the user granted the app (see AGENTS_SIGN_IN_SCOPE). */
  scope: string;
}

interface ExampleAgentsState {
  users: Map<string, AgentAppUser>;
  sessions: Map<string, AgentSessionRecord>;
  sandboxManager: SandboxManager | null;
}

const STATE_KEY = Symbol.for("@schemavaults/example-nextjs-resource-server/agents");

/**
 * The example's state, in memory: one server process serves the app (CI runs
 * `next start` in one container), so a restart signs everyone out and ends
 * every agent session. Kept on `globalThis` so every route bundle sees the
 * same maps. A deployment would keep users and sessions in a database and
 * sandboxes in the SDK's dbh store.
 */
export function agentsState(): ExampleAgentsState {
  const holder = globalThis as unknown as Record<symbol, ExampleAgentsState | undefined>;
  holder[STATE_KEY] ??= { users: new Map(), sessions: new Map(), sandboxManager: null };
  return holder[STATE_KEY];
}

export function getAgentSandboxManager(): SandboxManager {
  const state = agentsState();
  state.sandboxManager ??= createAgentSandboxManager();
  return state.sandboxManager;
}
