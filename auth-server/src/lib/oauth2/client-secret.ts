// client-secret.ts
//
// Generation, hashing, and verification of OAuth2/OIDC client secrets
// for confidential client applications.
//
// Generated secrets are 32 random bytes (256 bits of entropy), so a
// single unsalted SHA-256 digest is sufficient for at-rest storage —
// there is nothing to dictionary-attack, and the digest supports cheap
// per-request verification at the token endpoints (same rationale as
// the MFA recovery-code HMAC in lib/mfa/hash-recovery-code.ts). The
// plaintext is returned once at generation/rotation time and never
// persisted.

import "server-only";
import { createHash, randomBytes } from "node:crypto";
import timingSafeEqualSecretString from "@/lib/timingSafeEqualSecretString";

/**
 * Identifiable prefix so leaked secrets can be recognized in logs and
 * secret-scanning tooling (svs = SchemaVaults secret).
 */
export const CLIENT_SECRET_PREFIX = "svs_" as const;

const CLIENT_SECRET_RANDOM_BYTES = 32;

export function generateClientSecret(): string {
  const random: string = randomBytes(CLIENT_SECRET_RANDOM_BYTES).toString(
    "base64url",
  );
  return `${CLIENT_SECRET_PREFIX}${random}`;
}

/** Hex-encoded SHA-256 digest of the plaintext secret (the stored form). */
export function hashClientSecret(client_secret: string): string {
  return createHash("sha256").update(client_secret, "utf8").digest("hex");
}

/**
 * Timing-safe check of a presented client secret against the stored
 * digest.
 */
export function verifyClientSecret(
  presented_client_secret: string,
  stored_secret_hash: string,
): boolean {
  if (
    typeof presented_client_secret !== "string" ||
    presented_client_secret.length === 0 ||
    typeof stored_secret_hash !== "string" ||
    stored_secret_hash.length === 0
  ) {
    return false;
  }
  return timingSafeEqualSecretString(
    stored_secret_hash,
    hashClientSecret(presented_client_secret),
  );
}
