import "server-only";

import type Redis from "ioredis";
import { z } from "zod";

const CHALLENGE_KEY_PREFIX = "mfa:challenge:";
export const MFA_CHALLENGE_TTL_SECONDS = 300;
export const MFA_CHALLENGE_MAX_ATTEMPTS = 5;

const challengeStateSchema = z
  .object({
    uid: z.string().uuid(),
    client_app_id: z.string(),
    code_challenge: z.string(),
    challenge_time: z.number(),
    attempts_remaining: z.number().int().nonnegative(),
    created_at: z.number().int().nonnegative(),
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
    ttl_seconds?: number;
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

export async function deleteChallenge(
  client: Redis,
  challenge_id: string,
): Promise<void> {
  await client.del(makeKey(challenge_id));
}
