// NOT server-only: pure functions over session records (unit tested).

import type { AgentSessionRecord } from "./types";

/**
 * Bounds on what the agents app keeps alive, so a public deployment cannot be
 * made to pile up sandboxes (each is a directory and processes on the
 * server): live sessions per user and in total, and how long a session may sit
 * idle before it is ended (its token revoked, its sandbox destroyed).
 */
export interface AgentSessionLimits {
  perUser: number;
  total: number;
  idleTimeoutMs: number;
}

export const AGENT_SESSION_LIMITS: AgentSessionLimits = {
  perUser: 5,
  total: 50,
  idleTimeoutMs: 30 * 60 * 1000,
};

/** A session that still holds a sandbox (not ended, and started successfully). */
export function isLiveSession(record: AgentSessionRecord): boolean {
  return !record.ended && record.sandbox_id !== null;
}

/** Why `owner_sub` may not start another session now, or null when they may. */
export function sessionLimitProblem(
  records: Iterable<AgentSessionRecord>,
  owner_sub: string,
  limits: AgentSessionLimits = AGENT_SESSION_LIMITS,
): string | null {
  let mine = 0;
  let total = 0;
  for (const record of records) {
    if (!isLiveSession(record)) continue;
    total += 1;
    if (record.owner_sub === owner_sub) mine += 1;
  }
  if (mine >= limits.perUser) {
    return `You already have ${mine} agent sessions running; end one to start another.`;
  }
  if (total >= limits.total) {
    return "This server is running as many agent sessions as it allows; try again later.";
  }
  return null;
}

/** Live sessions idle past the timeout (and not mid-turn): due to be ended. */
export function idleSessions(
  records: Iterable<AgentSessionRecord>,
  now: number = Date.now(),
  limits: AgentSessionLimits = AGENT_SESSION_LIMITS,
): AgentSessionRecord[] {
  return [...records].filter(
    (record) =>
      isLiveSession(record) && record.status !== "running" && now - record.updated_at >= limits.idleTimeoutMs,
  );
}
