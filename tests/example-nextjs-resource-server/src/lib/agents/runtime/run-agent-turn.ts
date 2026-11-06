import "server-only";
import type { ExecResult, SandboxManager } from "@schemavaults/sandbox-management-sdk";
import { FakeAgentModel, type AgentModelMessage } from "../model/fake-agent-model";
import { parseAgentApiToolOutput } from "../sandbox/agent-tools";
import { runInAgentSandbox } from "../sandbox/agent-sandbox";
import type { AgentSessionRecord, AgentTranscriptEntry } from "./types";

/** Model steps per turn: pick a tool, then explain its result. */
const MAX_STEPS = 2;
/** How long the fake model "thinks" before each step, so the UI shows it working. */
const THINKING_MS = 200;

/** `Omit` applied to each member of a union, so the entry kinds stay distinct. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type NewEntry = DistributiveOmit<AgentTranscriptEntry, "id" | "at">;

/** Appends to a session's transcript and stamps its activity time. */
export function appendEntry(record: AgentSessionRecord, entry: NewEntry): void {
  const at = Date.now();
  record.transcript.push({ ...entry, id: crypto.randomUUID(), at } as AgentTranscriptEntry);
  record.updated_at = at;
}

/**
 * Runs one turn of the agent on `prompt`: the model picks a tool, the tool
 * runs in the session's sandbox with the session's delegated token, and the
 * model explains the result. A 401 from the API marks the credential as
 * rejected (the user signed out, or the token was revoked elsewhere), so the
 * page offers to grant access again.
 */
export async function runAgentTurn(
  manager: SandboxManager,
  record: AgentSessionRecord,
  prompt: string,
): Promise<void> {
  const model = new FakeAgentModel();
  const history: AgentModelMessage[] = [{ role: "user", content: prompt }];
  appendEntry(record, { kind: "user", text: prompt });

  for (let step = 0; step < MAX_STEPS; step += 1) {
    await new Promise((resolve) => setTimeout(resolve, THINKING_MS));
    const turn = model.respond(history);
    if (turn.text) {
      appendEntry(record, { kind: "assistant", text: turn.text });
      history.push({ role: "assistant", content: turn.text });
    }
    if (!turn.toolCall || !record.sandbox_id) return;

    let result: ExecResult;
    try {
      result = await runInAgentSandbox(manager, record.sandbox_id, turn.toolCall.command);
    } catch (e: unknown) {
      result = { exitCode: 1, stdout: "", stderr: `${e instanceof Error ? e.message : String(e)}\n` };
    }
    appendEntry(record, {
      kind: "tool",
      tool: turn.toolCall.tool,
      command: turn.toolCall.command,
      exitCode: result.exitCode,
      output: `${result.stdout}${result.stderr}`.trimEnd(),
    });
    history.push({ role: "tool", tool: turn.toolCall.tool, result });

    const credential = record.credential;
    if (credential?.status === "active" && parseAgentApiToolOutput(result.stdout)?.status === 401) {
      credential.status = credential.expires_at <= Date.now() ? "expired" : "rejected";
    }
  }
}
