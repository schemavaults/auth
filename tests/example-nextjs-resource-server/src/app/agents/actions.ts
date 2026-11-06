"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AGENTS_COOKIE_PATH, AGENTS_SESSION_COOKIE } from "@/lib/agents/auth/agents-client";
import { endAgentsSignIn } from "@/lib/agents/auth/agents-sign-in";
import { getSignedInAgentUser } from "@/lib/agents/auth/signed-in-user";
import {
  AgentSessionError,
  endAgentSession,
  grantAgentAccessAgain,
  listAgentSessions,
  revokeAgentAccess,
  sendAgentMessage,
  startAgentSession,
} from "@/lib/agents/runtime/agent-sessions";
import type { AgentAppUser } from "@/lib/agents/runtime/state";
import type { AgentSessionView } from "@/lib/agents/runtime/types";
import { resolvePublicOriginFromRequest } from "@/lib/api/public-origin-next";

export type AgentActionResult =
  | { ok: true; session: AgentSessionView; sessions: AgentSessionView[] }
  | { ok: false; error: string; signedOut?: boolean };

const MAX_PROMPT_LENGTH = 2000;

/**
 * Every Server Function re-checks who is signed in (they are reachable by a
 * direct POST, not only from the page) and only touches that user's sessions.
 */
async function asSignedInUser(
  run: (user: AgentAppUser) => Promise<AgentSessionView>,
): Promise<AgentActionResult> {
  const user = await getSignedInAgentUser();
  if (!user) return { ok: false, error: "You are signed out of the agents app.", signedOut: true };
  try {
    const session = await run(user);
    return { ok: true, session, sessions: listAgentSessions(user) };
  } catch (e: unknown) {
    if (e instanceof AgentSessionError) return { ok: false, error: e.message };
    console.error("[agents] Server Function failed", e);
    return { ok: false, error: "Something went wrong; see the server log." };
  }
}

function checkPrompt(prompt: unknown): string {
  if (typeof prompt !== "string" || prompt.trim().length === 0 || prompt.length > MAX_PROMPT_LENGTH) {
    throw new AgentSessionError(`A prompt is 1 to ${MAX_PROMPT_LENGTH} characters.`);
  }
  return prompt.trim();
}

/**
 * Where the agent's tools reach the example API: this app's own public origin,
 * unless EXAMPLE_AGENTS_API_BASE_URL pins it. The agent sends its token there,
 * so a deployment should pin it rather than trust the request's host.
 */
async function agentApiBaseUrl(): Promise<string> {
  return process.env.EXAMPLE_AGENTS_API_BASE_URL || (await resolvePublicOriginFromRequest());
}

export async function startAgentSessionAction(input: {
  scopes: string[];
  prompt: string;
}): Promise<AgentActionResult> {
  return asSignedInUser(async (user) =>
    startAgentSession(user, {
      scopes: Array.isArray(input?.scopes) ? input.scopes.filter((scope) => typeof scope === "string") : [],
      prompt: checkPrompt(input?.prompt),
      apiBaseUrl: await agentApiBaseUrl(),
    }),
  );
}

export async function sendAgentMessageAction(sessionId: string, prompt: string): Promise<AgentActionResult> {
  return asSignedInUser(async (user) => sendAgentMessage(user, String(sessionId), checkPrompt(prompt)));
}

export async function revokeAgentAccessAction(sessionId: string): Promise<AgentActionResult> {
  return asSignedInUser(async (user) => revokeAgentAccess(user, String(sessionId)));
}

export async function grantAgentAccessAgainAction(sessionId: string): Promise<AgentActionResult> {
  return asSignedInUser(async (user) => grantAgentAccessAgain(user, String(sessionId)));
}

export async function endAgentSessionAction(sessionId: string): Promise<AgentActionResult> {
  return asSignedInUser(async (user) => endAgentSession(user, String(sessionId)));
}

/**
 * Signs out of the agents app: revokes the sign-in's refresh token (which
 * ends the agents' delegated tokens with it) and clears the session cookie.
 */
export async function signOutOfAgentsAction(): Promise<void> {
  const user = await getSignedInAgentUser();
  if (user) await endAgentsSignIn(user);
  (await cookies()).set(AGENTS_SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: (await resolvePublicOriginFromRequest()).startsWith("https:"),
    path: AGENTS_COOKIE_PATH,
    maxAge: 0,
  });
  redirect(AGENTS_COOKIE_PATH);
}
