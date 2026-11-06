import "server-only";
import { cookies } from "next/headers";
import { agentsState, type AgentAppUser } from "../runtime/state";
import { AGENTS_SESSION_COOKIE } from "./agents-client";

/** The user signed in to the agents app, from the session cookie; null when signed out. */
export async function getSignedInAgentUser(): Promise<AgentAppUser | null> {
  const sessionId = (await cookies()).get(AGENTS_SESSION_COOKIE)?.value;
  return sessionId ? (agentsState().users.get(sessionId) ?? null) : null;
}
