import "server-only";

import type Redis from "ioredis";
import { z } from "zod";
import isValidUuid from "@/lib/is-valid-uuid";

// Short-lived store for a WebAuthn *step-up* assertion challenge used to
// authorize a sensitive account action (e.g. removing a passkey) inside an
// already-authenticated session. Keyed by uid: a user has at most one
// outstanding step-up challenge at a time. Separate from both the login
// challenge store and the enrollment registration store.

const STEP_UP_KEY_PREFIX = "mfa:stepup:webauthn:";
export const WEBAUTHN_STEP_UP_TTL_SECONDS = 300;

const stepUpStateSchema = z
  .object({
    challenge: z.string(),
    created_at: z.number().int().nonnegative(),
  })
  .strict();

function makeKey(uid: string): string {
  // The uid is interpolated directly into the Redis key, so reject anything
  // that isn't a well-formed UUID — an empty or attacker-controlled value
  // could otherwise read, overwrite, or delete a different key.
  if (!isValidUuid(uid)) {
    throw new TypeError(
      "Cannot access WebAuthn step-up challenge: 'uid' is not a valid UUID",
    );
  }
  return `${STEP_UP_KEY_PREFIX}${uid}`;
}

export async function putStepUpChallenge(
  client: Redis,
  args: { uid: string; challenge: string },
): Promise<void> {
  if (typeof args.challenge !== "string" || args.challenge.length === 0) {
    throw new TypeError(
      "Cannot store WebAuthn step-up challenge: 'challenge' must be a non-empty string",
    );
  }
  await client.set(
    makeKey(args.uid),
    JSON.stringify({ challenge: args.challenge, created_at: Date.now() }),
    "EX",
    WEBAUTHN_STEP_UP_TTL_SECONDS,
  );
}

export async function getStepUpChallenge(
  client: Redis,
  uid: string,
): Promise<string | null> {
  const raw = await client.get(makeKey(uid));
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const result = stepUpStateSchema.safeParse(parsed);
  return result.success ? result.data.challenge : null;
}

export async function deleteStepUpChallenge(
  client: Redis,
  uid: string,
): Promise<void> {
  await client.del(makeKey(uid));
}
