// sign-in-authorization-request-storage.ts
//
// localStorage for what sign-ins asked for (see the client SDK's
// `needsReauthorization()`): each flow's authorization request, keyed by its
// challenge_time like `next_href` (expiry-pruned on write), and the
// session's, recorded once its flow's code is redeemed.

import {
  parseSignInAuthorizationRequest,
  type SignInAuthorizationRequest,
} from "@schemavaults/auth-client-sdk";
import { PKCE_ProofKeyManager } from "@schemavaults/auth-common";

const FLOW_REQUESTS_KEY = "sign_in_authorization_requests" as const;
const SESSION_REQUEST_KEY = "session_authorization_request" as const;

function loadFlowRequests(
  storage: Storage,
): Record<string, SignInAuthorizationRequest> {
  const raw: string | null = storage.getItem(FLOW_REQUESTS_KEY);
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    storage.removeItem(FLOW_REQUESTS_KEY);
    return {};
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    storage.removeItem(FLOW_REQUESTS_KEY);
    return {};
  }
  const requests: Record<string, SignInAuthorizationRequest> = {};
  for (const [challenge_time, value] of Object.entries(parsed)) {
    const request: SignInAuthorizationRequest | null =
      parseSignInAuthorizationRequest(value);
    if (request && !isNaN(Number(challenge_time))) {
      requests[challenge_time] = request;
    }
  }
  return requests;
}

export function storeFlowAuthorizationRequest(
  storage: Storage,
  request: SignInAuthorizationRequest,
  challenge_time: number,
): void {
  const requests = loadFlowRequests(storage);
  // Abandoned flows' entries go once the flow could no longer complete.
  const now: number = Date.now();
  for (const key of Object.keys(requests)) {
    if (now - Number(key) > PKCE_ProofKeyManager.max_age) {
      delete requests[key];
    }
  }
  requests[String(challenge_time)] = {
    scope: request.scope,
    resource: request.resource,
  };
  storage.setItem(FLOW_REQUESTS_KEY, JSON.stringify(requests));
}

export function loadFlowAuthorizationRequest(
  storage: Storage,
  challenge_time: number,
): SignInAuthorizationRequest | null {
  return loadFlowRequests(storage)[String(challenge_time)] ?? null;
}

export function clearFlowAuthorizationRequest(
  storage: Storage,
  challenge_time: number,
): void {
  const requests = loadFlowRequests(storage);
  if (String(challenge_time) in requests) {
    delete requests[String(challenge_time)];
    storage.setItem(FLOW_REQUESTS_KEY, JSON.stringify(requests));
  }
}

export function storeSessionAuthorizationRequest(
  storage: Storage,
  request: SignInAuthorizationRequest,
): void {
  storage.setItem(
    SESSION_REQUEST_KEY,
    JSON.stringify({ scope: request.scope, resource: request.resource }),
  );
}

export function loadSessionAuthorizationRequest(
  storage: Storage,
): SignInAuthorizationRequest | null {
  const raw: string | null = storage.getItem(SESSION_REQUEST_KEY);
  if (!raw) return null;
  try {
    return parseSignInAuthorizationRequest(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function clearSessionAuthorizationRequest(storage: Storage): void {
  storage.removeItem(SESSION_REQUEST_KEY);
}
