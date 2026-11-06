"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  OAuthEndpointError,
  exchangeTokenForDelegatedToken,
  revokeToken,
} from "@schemavaults/auth-server-sdk";
import { AGENTS_COOKIE_PATH, agentsClientCredentials } from "@/lib/agents/auth/agents-client";
import { endAgentsSignIn, withFreshAccessToken } from "@/lib/agents/auth/agents-sign-in";
import {
  clearAgentsSignIn,
  readAgentsSignIn,
  writeAgentsSignIn,
  type AgentsSignIn,
} from "@/lib/agents/auth/sign-in-cookie";
import type { DelegatedTokenGrant } from "@/lib/agents/runtime/types";
import { delegatedScopeFor } from "@/lib/agents/scopes";
import { resolvePublicOriginFromRequest } from "@/lib/api/public-origin-next";

/**
 * The agents app's server side: only what needs the client secret. Agent
 * sessions, transcripts and sandboxes live in the user's browser
 * (src/lib/agents/browser/); the sign-in lives in sealed cookies. So these
 * Server Functions keep nothing between requests, and any server instance can
 * answer any of them. Each re-reads the sign-in: they are reachable by a
 * direct POST, not only from the page.
 */

export type AgentServerResult<T> =
  | ({ ok: true } & T)
  | { ok: false; error: string; signedOut?: boolean };

const SIGNED_OUT = { ok: false, error: "You are signed out of the agents app.", signedOut: true } as const;

async function secureCookies(): Promise<boolean> {
  return (await resolvePublicOriginFromRequest()).startsWith("https:");
}

function describeAuthServerError(error: unknown): string {
  if (error instanceof OAuthEndpointError) {
    return `${error.error ?? `HTTP ${error.status}`}${error.error_description ? `: ${error.error_description}` : ""}`;
  }
  return error instanceof Error ? error.message : String(error);
}

/**
 * Exchanges the signed-in user's access token (RFC 8693, as the confidential
 * client) for a DELEGATED token on which the app's service account acts for
 * them, narrowed to `scopes` (see delegatedScopeFor()), for one agent session.
 * Renews the user's token first when it is about to expire.
 */
export async function mintDelegatedTokenAction(
  scopes: string[],
): Promise<AgentServerResult<{ grant: DelegatedTokenGrant }>> {
  const jar = await cookies();
  const signIn = await readAgentsSignIn(jar);
  if (!signIn) return SIGNED_OUT;

  let fresh: AgentsSignIn;
  try {
    const renewal = await withFreshAccessToken(signIn);
    fresh = renewal.signIn;
    if (renewal.renewed) await writeAgentsSignIn(jar, fresh, await secureCookies(), jar);
  } catch (e: unknown) {
    console.error("[agents] Renewing the user's token failed; signing them out", e);
    clearAgentsSignIn(jar, await secureCookies());
    return { ok: false, error: "Your sign-in has ended; sign in again.", signedOut: true };
  }

  try {
    const response = await exchangeTokenForDelegatedToken({
      ...agentsClientCredentials(),
      subject_token: fresh.access_token,
      scope: delegatedScopeFor(Array.isArray(scopes) ? scopes.filter((s) => typeof s === "string") : []),
    });
    return {
      ok: true,
      grant: {
        access_token: response.access_token,
        scope: response.scope ?? "",
        expires_at: Date.now() + response.expires_in * 1000,
      },
    };
  } catch (e: unknown) {
    return { ok: false, error: describeAuthServerError(e) };
  }
}

/** Revokes an agent's delegated token at the auth server (RFC 7009, as the confidential client). */
export async function revokeDelegatedTokenAction(token: string): Promise<AgentServerResult<object>> {
  if (!(await readAgentsSignIn(await cookies()))) return SIGNED_OUT;
  if (typeof token !== "string" || token.length === 0) return { ok: false, error: "No token to revoke." };
  try {
    await revokeToken({ ...agentsClientCredentials(), token, token_type_hint: "access_token" });
    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, error: describeAuthServerError(e) };
  }
}

/**
 * Signs out of the agents app: revokes the sign-in's refresh token (which
 * ends the agents' delegated tokens with it) and clears its cookies.
 */
export async function signOutOfAgentsAction(): Promise<void> {
  const jar = await cookies();
  const signIn = await readAgentsSignIn(jar);
  if (signIn) await endAgentsSignIn(signIn);
  clearAgentsSignIn(jar, await secureCookies());
  redirect(AGENTS_COOKIE_PATH);
}
