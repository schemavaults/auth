import "server-only";

import type Redis from "ioredis";
import { z } from "zod";

const CHALLENGE_KEY_PREFIX = "mfa:challenge:";
export const MFA_CHALLENGE_TTL_SECONDS = 300;
export const MFA_CHALLENGE_MAX_ATTEMPTS = 3;

const challengeStateSchema = z
  .object({
    uid: z.string().uuid(),
    client_app_id: z.string(),
    code_challenge: z.string(),
    challenge_time: z.number(),
    attempts_remaining: z.number().int().nonnegative(),
    created_at: z.number().int().nonnegative(),
    // OAuth2 `redirect_uri` carried across the MFA gate so the
    // authorization code issued by /api/auth/mfa/verify can be bound to
    // the same redirect_uri the user originally arrived with. Null for
    // the auth server's own /account flow. Made nullable here for
    // backwards-compatibility with in-flight challenges minted before
    // this field was added; on a server restart with stale entries the
    // verify path treats absent as null.
    redirect_uri: z.string().nullable().optional(),
    // Server-issued WebAuthn assertion challenge (base64url) attached lazily
    // when the user chooses to authenticate with a passkey. Absent until the
    // client requests passkey options for this challenge.
    webauthn_challenge: z.string().optional(),
    // OIDC surface context carried across the MFA gate (mirrors
    // redirect_uri above): whether the flow started at
    // /api/oidc/authorize, plus the nonce/scope to stamp on the
    // authorization-code row minted by /api/auth/mfa/verify. All
    // optional for backwards-compatibility with in-flight challenges.
    oidc: z.boolean().nullable().optional(),
    nonce: z.string().nullable().optional(),
    scope: z.string().nullable().optional(),
  })
  .strict();

export type MfaChallengeState = z.infer<typeof challengeStateSchema>;

function makeKey(challenge_id: string): string {
  return `${CHALLENGE_KEY_PREFIX}${challenge_id}`;
}

export async function createChallenge(
  client: Redis,
  args: {
    challenge_id: string;
    uid: string;
    client_app_id: string;
    code_challenge: string;
    challenge_time: number;
    redirect_uri: string | null;
    ttl_seconds?: number;
    oidc?: { nonce: string | null; scope: string } | null;
  },
): Promise<{ expires_at: number }> {
  const ttl = args.ttl_seconds ?? MFA_CHALLENGE_TTL_SECONDS;
  const now = Date.now();
  const state: MfaChallengeState = {
    uid: args.uid,
    client_app_id: args.client_app_id,
    code_challenge: args.code_challenge,
    challenge_time: args.challenge_time,
    attempts_remaining: MFA_CHALLENGE_MAX_ATTEMPTS,
    created_at: now,
    redirect_uri: args.redirect_uri,
    oidc: args.oidc ? true : null,
    nonce: args.oidc ? args.oidc.nonce : null,
    scope: args.oidc ? args.oidc.scope : null,
  };
  await client.set(makeKey(args.challenge_id), JSON.stringify(state), "EX", ttl);
  return { expires_at: now + ttl * 1000 };
}

export async function getChallenge(
  client: Redis,
  challenge_id: string,
): Promise<MfaChallengeState | null> {
  const raw = await client.get(makeKey(challenge_id));
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const result = challengeStateSchema.safeParse(parsed);
  return result.success ? result.data : null;
}

// Atomically decrement attempts_remaining. If the resulting counter is 0,
// delete the key so the challenge is one-shot at exhaustion. Returns the
// post-decrement attempts_remaining, or -1 if the key was missing/expired.
const ATTEMPT_DECREMENT_LUA = `
local key = KEYS[1]
local raw = redis.call('GET', key)
if not raw then return -1 end
local ttl = redis.call('PTTL', key)
local ok, state = pcall(cjson.decode, raw)
if not ok or type(state) ~= 'table' then return -1 end
local remaining = tonumber(state.attempts_remaining or 0) - 1
if remaining <= 0 then
  redis.call('DEL', key)
  return 0
end
state.attempts_remaining = remaining
redis.call('SET', key, cjson.encode(state), 'PX', ttl)
return remaining
`;

export async function consumeAttempt(
  client: Redis,
  challenge_id: string,
): Promise<{ remaining: number; existed: boolean }> {
  const result = (await client.eval(
    ATTEMPT_DECREMENT_LUA,
    1,
    makeKey(challenge_id),
  )) as number;
  if (result === -1) return { remaining: 0, existed: false };
  return { remaining: result, existed: true };
}

// Attach a WebAuthn assertion challenge to an existing MFA challenge without
// disturbing its remaining TTL or attempt counter. Done in a small Lua script
// (GET + SET with the preserved PTTL) so requesting passkey options can't be
// used to extend a challenge's lifetime or reset attempts. Returns false if
// the challenge no longer exists.
const SET_WEBAUTHN_CHALLENGE_LUA = `
local key = KEYS[1]
local raw = redis.call('GET', key)
if not raw then return 0 end
local ttl = redis.call('PTTL', key)
if ttl < 0 then return 0 end
local ok, state = pcall(cjson.decode, raw)
if not ok or type(state) ~= 'table' then return 0 end
state.webauthn_challenge = ARGV[1]
redis.call('SET', key, cjson.encode(state), 'PX', ttl)
return 1
`;

export async function setWebauthnChallenge(
  client: Redis,
  challenge_id: string,
  webauthn_challenge: string,
): Promise<boolean> {
  const result = (await client.eval(
    SET_WEBAUTHN_CHALLENGE_LUA,
    1,
    makeKey(challenge_id),
    webauthn_challenge,
  )) as number;
  return result === 1;
}

export async function deleteChallenge(
  client: Redis,
  challenge_id: string,
): Promise<void> {
  await client.del(makeKey(challenge_id));
}
