import "server-only";

import { createHmac } from "node:crypto";

function readPepper(): Buffer {
  const raw = process.env.PRIVATE_MFA_RECOVERY_PEPPER;
  if (typeof raw !== "string" || raw.length === 0) {
    throw new Error(
      "PRIVATE_MFA_RECOVERY_PEPPER is not set. Generate one with `openssl rand -base64 32` and add it to your environment.",
    );
  }
  const buf = Buffer.from(raw, "base64");
  if (buf.length < 16) {
    throw new Error(
      "PRIVATE_MFA_RECOVERY_PEPPER decodes to fewer than 16 bytes; expected at least 32 bytes (use `openssl rand -base64 32`).",
    );
  }
  return buf;
}

// Lowercases and strips whitespace + dashes so the user's display
// formatting (e.g. "ABCDE-FGHIJ" vs "abcdefghij") yields the same hash.
export function normalizeRecoveryCode(code: string): string {
  return code.replace(/[\s-]/g, "").toLowerCase();
}

export function hashRecoveryCode(code: string): string {
  const pepper = readPepper();
  const normalized = normalizeRecoveryCode(code);
  return createHmac("sha256", pepper).update(normalized, "utf8").digest("hex");
}
