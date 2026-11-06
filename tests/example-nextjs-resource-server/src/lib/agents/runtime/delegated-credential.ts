import "server-only";
import {
  OAuthEndpointError,
  exchangeTokenForDelegatedToken,
  revokeToken,
} from "@schemavaults/auth-server-sdk";
import { agentsClientCredentials } from "../auth/agents-client";
import { freshUserAccessToken } from "../auth/agents-sign-in";
import { delegatedScopeFor } from "../scopes";
import type { AgentAppUser } from "./state";
import type { AgentCredential } from "./types";

/** Renew a delegated token this long before it expires. */
const RENEW_BEFORE_EXPIRY_MS = 60_000;

/**
 * Mints an agent's credential: the user's access token for the example API,
 * exchanged (RFC 8693, as the confidential client) for a DELEGATED token on
 * which the app's service account acts for the user, narrowed to the scopes
 * the user picked for the session. It expires with the user's token and dies
 * with the user's sign-in (auth server >= 0.67.8).
 */
export async function mintDelegatedCredential(
  user: AgentAppUser,
  requestedScopes: readonly string[],
): Promise<AgentCredential> {
  const subject_token = await freshUserAccessToken(user);
  const response = await exchangeTokenForDelegatedToken({
    ...agentsClientCredentials(),
    subject_token,
    scope: delegatedScopeFor(requestedScopes),
  });
  return {
    access_token: response.access_token,
    scope: response.scope ?? "",
    expires_at: Date.now() + response.expires_in * 1000,
    status: "active",
  };
}

/** Revokes an agent's credential at the auth server (RFC 7009). */
export async function revokeDelegatedCredential(credential: AgentCredential): Promise<void> {
  await revokeToken({
    ...agentsClientCredentials(),
    token: credential.access_token,
    token_type_hint: "access_token",
  });
  credential.status = "revoked";
}

/** Whether an active credential is about to expire and should be minted again. */
export function credentialNeedsRenewal(credential: AgentCredential, now: number = Date.now()): boolean {
  return credential.status === "active" && credential.expires_at - now < RENEW_BEFORE_EXPIRY_MS;
}

/** A refusal of the auth server, as the transcript shows it. */
export function describeAuthServerError(error: unknown): string {
  if (error instanceof OAuthEndpointError) {
    return `${error.error ?? `HTTP ${error.status}`}${error.error_description ? `: ${error.error_description}` : ""}`;
  }
  return error instanceof Error ? error.message : String(error);
}
