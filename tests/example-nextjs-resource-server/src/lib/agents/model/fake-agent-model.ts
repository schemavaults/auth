// NOT server-only: a pure function of the conversation (unit tested).

import type { ExecResult } from "@schemavaults/sandbox-management-sdk";
import {
  AGENT_TOKEN_FILE,
  agentApiCommand,
  parseAgentApiToolOutput,
  type AgentApiToolOutput,
} from "../sandbox/agent-tools";

export const FAKE_AGENT_MODEL_NAME = "fake-agent-1" as const;

/** The tools the agent has, each a command it runs in its sandbox. */
export const AGENT_TOOLS = {
  whoami: agentApiCommand("GET", "/api/whoami"),
  email: agentApiCommand("GET", "/api/me/email"),
  notes: agentApiCommand("GET", "/api/me/notes"),
  "delete-account": agentApiCommand("POST", "/api/me/account-deletion"),
  health: agentApiCommand("GET", "/api/health"),
  environment: "env",
  files: "ls -A",
} as const satisfies Record<string, string>;

export type AgentToolName = keyof typeof AGENT_TOOLS;

export type AgentModelMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string }
  | { role: "tool"; tool: AgentToolName; result: ExecResult };

/** One model turn: what to say, and optionally a tool to run. */
export interface AgentModelTurn {
  text: string;
  toolCall?: { tool: AgentToolName; command: string };
}

const HELP =
  "I can call the example API for you: ask who you are, for your email address or your notes, or check that the API is up. I can also show you what's in my sandbox and its environment.";

/** Intents in the order they are tried: the first whose pattern matches wins. */
const INTENTS: readonly { pattern: RegExp; tool: AgentToolName; text: string }[] = [
  {
    pattern: /\b(delete|close|remove|erase)\b.*\baccount\b/i,
    tool: "delete-account",
    text: "I'll ask the API to delete your account.",
  },
  { pattern: /\bnotes?\b/i, tool: "notes", text: "Let me read your notes." },
  { pattern: /\be-?mail\b/i, tool: "email", text: "Let me look up your email address." },
  {
    pattern: /\b(who ?am ?i|whoami|identity|who are you acting for|on whose behalf)\b/i,
    tool: "whoami",
    text: "Let me ask the API who I'm acting for.",
  },
  {
    pattern: /\b(env|environment|variables?|secrets?|credentials?)\b/i,
    tool: "environment",
    text: "Here's my sandbox's environment.",
  },
  {
    pattern: /\b(files?|ls|sandbox|workspace|director(?:y|ies))\b/i,
    tool: "files",
    text: "Let me list what's in my sandbox.",
  },
  {
    pattern: /\b(health|ping|is the api (?:up|down)|api status)\b/i,
    tool: "health",
    text: "Let me check that the API is up.",
  },
];

/**
 * A fake language model, so the example needs no model provider and its E2E
 * suite stays deterministic: it maps a prompt to one of the agent's tools by
 * keyword, and after the tool ran, explains the result. It has no weights and
 * no randomness; everything interesting happens in the auth server, the
 * sandbox and the API it calls.
 */
export class FakeAgentModel {
  readonly name = FAKE_AGENT_MODEL_NAME;

  respond(history: readonly AgentModelMessage[]): AgentModelTurn {
    const last = history.at(-1);
    if (!last || last.role === "assistant") return { text: "" };
    if (last.role === "tool") return { text: explainToolResult(last.tool, last.result) };

    const prompt = last.content.trim();
    for (const intent of INTENTS) {
      if (intent.pattern.test(prompt)) {
        return { text: intent.text, toolCall: { tool: intent.tool, command: AGENT_TOOLS[intent.tool] } };
      }
    }
    if (/^(hi|hello|hey)\b|\bhelp\b|what can you do/i.test(prompt)) {
      return { text: `Hello! I'm ${FAKE_AGENT_MODEL_NAME}, a fake model. ${HELP}` };
    }
    return { text: `I'm only a fake model, so I don't know what to do with that. ${HELP}` };
  }
}

/** The model's explanation of a tool's result. */
export function explainToolResult(tool: AgentToolName, result: ExecResult): string {
  if (tool === "environment") return explainEnvironment(result.stdout);
  if (tool === "files") {
    const entries = result.stdout.split("\n").filter((line) => line.length > 0);
    return `My sandbox holds ${entries.map((entry) => `\`${entry}\``).join(", ")}. The token I call the API with is the file \`${AGENT_TOKEN_FILE}\`.`;
  }

  const output: AgentApiToolOutput | null = parseAgentApiToolOutput(result.stdout);
  if (!output) {
    const reason = (result.stderr || result.stdout).trim().split("\n")[0] ?? "";
    return `That didn't work (exit code ${result.exitCode})${reason ? `: ${reason}` : "."}`;
  }
  const body = asRecord(output.body);
  const error = typeof body.error === "string" ? body.error : null;

  if (output.status === 401) {
    return `The API turned me away (401${error ? ` ${error}` : ""}): my access to your account was revoked or has expired. Grant me access again to continue.`;
  }
  if (output.status === 403 && error === "delegated_caller_refused") {
    return "The API refused (403 delegated_caller_refused): it only accepts that request from you, never from an agent acting for you. If you really want to delete your account, you'll have to do it yourself.";
  }
  if (output.status === 403 && error === "insufficient_scope") {
    const details = asRecord(body.details);
    const missing = Array.isArray(details.missing_scopes) ? details.missing_scopes.join(" ") : "";
    return `I'm not allowed to do that (403 insufficient_scope): this session wasn't given the \`${missing}\` scope. Start a session with it if you want me to.`;
  }
  if (output.status < 200 || output.status >= 300) {
    return `The API answered ${output.status}${error ? ` ${error}` : ""}.`;
  }

  switch (tool) {
    case "whoami":
      return explainWhoami(body);
    case "email":
      return typeof body.email === "string"
        ? `Your email address is ${body.email}.`
        : "The API doesn't know an email address for you.";
    case "notes": {
      const notes = Array.isArray(body.notes) ? body.notes : [];
      return notes.length === 0 ? "You have no notes yet." : `You have ${notes.length} note(s).`;
    }
    case "delete-account":
      return "The API accepted the request to delete your account.";
    case "health":
      return "The API is up.";
  }
}

function explainWhoami(body: Record<string, unknown>): string {
  const email = typeof body.email === "string" ? body.email : "a user without an email address";
  const scope = typeof body.scope === "string" && body.scope.length > 0 ? body.scope : "no scope";
  const actor = asRecord(body.actor);
  if (typeof actor.sub !== "string") {
    return `You are ${email}, but the API sees your own credential, not an agent's.`;
  }
  const client = typeof actor.client_id === "string" ? ` of app \`${actor.client_id}\`` : "";
  return `You are ${email}. I'm calling the API as your agent: the token names \`${actor.sub}\`${client} as the actor, and this session's scope is \`${scope}\`.`;
}

function explainEnvironment(stdout: string): string {
  const names = stdout
    .split("\n")
    .map((line) => line.split("=")[0] ?? "")
    .filter((name) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(name))
    .sort();
  return `My sandbox has ${names.length} environment variables: ${names.join(", ")}. None of them holds a secret of the app; the only credential I have is my own delegated token, in \`${AGENT_TOKEN_FILE}\`.`;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
