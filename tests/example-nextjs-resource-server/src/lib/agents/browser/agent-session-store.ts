// NOT server-only: runs in the browser (unit tested).

import type { WebStorageLike } from "@schemavaults/sandbox-management-sdk/web-storage";
import type { AgentSessionRecord } from "../runtime/types";

/**
 * A user's agent sessions (summaries, transcripts and delegated tokens) in
 * Web Storage, one entry per user, so signing in as someone else on the same
 * browser shows only their sessions.
 */
export class AgentSessionStore {
  private readonly key: string;

  constructor(
    private readonly storage: WebStorageLike,
    ownerSub: string,
    prefix = "example-agents:sessions:",
  ) {
    this.key = prefix + ownerSub;
  }

  list(): AgentSessionRecord[] {
    const raw = this.storage.getItem(this.key);
    if (!raw) return [];
    try {
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as AgentSessionRecord[]) : [];
    } catch {
      return [];
    }
  }

  get(id: string): AgentSessionRecord | undefined {
    return this.list().find((record) => record.id === id);
  }

  save(record: AgentSessionRecord): void {
    const others = this.list().filter((existing) => existing.id !== record.id);
    this.storage.setItem(this.key, JSON.stringify([...others, record]));
  }
}
