// NOT server-only: the client renders AgentSessionView (which holds no token).

import type { AgentSession } from "@schemavaults/ui";
import type { AgentToolName } from "../model/fake-agent-model";

/** One line of an agent session's transcript, as the page renders it. */
export type AgentTranscriptEntry =
  | { id: string; kind: "user"; text: string; at: number }
  | { id: string; kind: "assistant"; text: string; at: number }
  | {
      id: string;
      kind: "tool";
      tool: AgentToolName;
      command: string;
      exitCode: number;
      output: string;
      at: number;
    }
  | { id: string; kind: "event"; text: string; tone: "info" | "warning" | "destructive"; at: number };

/**
 * The state of an agent's delegated token:
 *
 * - `active`: minted and not known to be dead;
 * - `revoked`: the user revoked it here (RFC 7009 at the auth server);
 * - `rejected`: the API turned it away (401), e.g. because the user signed
 *   out, which revokes the session's tokens and every agent token exchanged
 *   from them;
 * - `expired`: past its expiry (which is its subject token's).
 */
export type AgentCredentialStatus = "active" | "revoked" | "rejected" | "expired";

/** An agent's delegated token. Server-side only: never sent to the browser. */
export interface AgentCredential {
  access_token: string;
  /** The scope the auth server granted (a subset of the user's). */
  scope: string;
  /** Unix milliseconds. */
  expires_at: number;
  status: AgentCredentialStatus;
}

export interface AgentSessionRecord {
  id: string;
  /** OIDC `sub` of the user the agent acts for. */
  owner_sub: string;
  title: string;
  /** The scopes the user picked for the session (see scopes.ts). */
  requested_scopes: string[];
  created_at: number;
  updated_at: number;
  /** `running` while a turn is in progress, `completed` once ended. */
  status: "idle" | "running" | "completed" | "failed";
  sandbox_id: string | null;
  credential: AgentCredential | null;
  transcript: AgentTranscriptEntry[];
  ended: boolean;
}

/** What the page gets about a session: its summary and transcript, never its token. */
export interface AgentSessionView extends AgentSession {
  status: AgentSessionRecord["status"];
  scope: string | null;
  credentialStatus: AgentCredentialStatus | null;
  credentialExpiresAt: number | null;
  sandboxId: string | null;
  ended: boolean;
  transcript: AgentTranscriptEntry[];
}

export function toAgentSessionView(record: AgentSessionRecord): AgentSessionView {
  const last = [...record.transcript]
    .reverse()
    .find((entry) => entry.kind === "assistant" || entry.kind === "user");
  return {
    id: record.id,
    title: record.title,
    preview: last && "text" in last ? last.text : undefined,
    updatedAt: record.updated_at,
    status: record.status,
    scope: record.credential?.scope ?? null,
    credentialStatus: record.credential?.status ?? null,
    credentialExpiresAt: record.credential?.expires_at ?? null,
    sandboxId: record.sandbox_id,
    ended: record.ended,
    transcript: record.transcript.map((entry) => ({ ...entry })),
  };
}
