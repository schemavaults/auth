import "server-only";

import type Redis from "ioredis";
import { z } from "zod";

// Short-lived store for an in-progress passkey *enrollment* registration
// challenge, keyed by the pending factor_id. Separate from the login
// challenge store (challenge-store.ts) because enrollment happens inside an
// authenticated session, not the login gate. The stored uid scopes the
// challenge to its owner so a verify-enrollment call can't redeem another
// user's pending registration.

const REG_KEY_PREFIX = "mfa:webauthn:reg:";
export const WEBAUTHN_REG_TTL_SECONDS = 300;

const regChallengeStateSchema = z
  .object({
    uid: z.string().uuid(),
    challenge: z.string(),
    created_at: z.number().int().nonnegative(),
  })
  .strict();

export type WebauthnRegChallengeState = z.infer<
  typeof regChallengeStateSchema
>;

function makeKey(factor_id: string): string {
  return `${REG_KEY_PREFIX}${factor_id}`;
}

export async function putRegChallenge(
  client: Redis,
  args: { factor_id: string; uid: string; challenge: string },
): Promise<void> {
  const state: WebauthnRegChallengeState = {
    uid: args.uid,
    challenge: args.challenge,
    created_at: Date.now(),
  };
  await client.set(
    makeKey(args.factor_id),
    JSON.stringify(state),
    "EX",
    WEBAUTHN_REG_TTL_SECONDS,
  );
}

export async function getRegChallenge(
  client: Redis,
  factor_id: string,
): Promise<WebauthnRegChallengeState | null> {
  const raw = await client.get(makeKey(factor_id));
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const result = regChallengeStateSchema.safeParse(parsed);
  return result.success ? result.data : null;
}

export async function deleteRegChallenge(
  client: Redis,
  factor_id: string,
): Promise<void> {
  await client.del(makeKey(factor_id));
}
