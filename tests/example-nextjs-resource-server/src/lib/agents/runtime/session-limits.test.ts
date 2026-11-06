import { describe, expect, test } from "bun:test";
import { idleSessions, isLiveSession, sessionLimitProblem, type AgentSessionLimits } from "./session-limits";
import type { AgentSessionRecord } from "./types";

const LIMITS: AgentSessionLimits = { perUser: 2, total: 3, idleTimeoutMs: 60_000 };
const NOW = 1_700_000_000_000;

function session(owner_sub: string, overrides: Partial<AgentSessionRecord> = {}): AgentSessionRecord {
  return {
    id: crypto.randomUUID(),
    owner_sub,
    title: "Who am I?",
    requested_scopes: [],
    created_at: NOW,
    updated_at: NOW,
    status: "idle",
    sandbox_id: `sbx-${crypto.randomUUID()}`,
    credential: null,
    transcript: [],
    ended: false,
    ...overrides,
  };
}

describe("agent session limits", () => {
  test("only sessions holding a sandbox count", () => {
    expect(isLiveSession(session("a"))).toBe(true);
    expect(isLiveSession(session("a", { ended: true }))).toBe(false);
    expect(isLiveSession(session("a", { status: "failed", sandbox_id: null }))).toBe(false);
  });

  test("caps the live sessions of one user", () => {
    const records = [session("a"), session("a"), session("a", { ended: true })];
    expect(sessionLimitProblem(records, "a", LIMITS)).toContain("You already have 2 agent sessions running");
    expect(sessionLimitProblem(records, "b", LIMITS)).toBeNull();
  });

  test("caps the live sessions of the whole server", () => {
    const records = [session("a"), session("b"), session("c")];
    expect(sessionLimitProblem(records, "d", LIMITS)).toContain("as many agent sessions as it allows");
  });

  test("finds live sessions idle past the timeout, never one mid-turn", () => {
    const stale = session("a", { updated_at: NOW - 60_000 });
    const busy = session("a", { updated_at: NOW - 120_000, status: "running" });
    const recent = session("a", { updated_at: NOW - 59_999 });
    const ended = session("a", { updated_at: NOW - 120_000, ended: true });
    expect(idleSessions([stale, busy, recent, ended], NOW, LIMITS)).toEqual([stale]);
  });
});
