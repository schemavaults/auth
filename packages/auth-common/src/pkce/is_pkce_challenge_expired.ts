import { MAX_PKCE_CODE_VERIFIER_AGE } from "./code_verifier";

export function isPkceChallengeExpired(challenge_time: number): boolean {
  return Date.now() > challenge_time + MAX_PKCE_CODE_VERIFIER_AGE;
}
