import { z } from "zod";

/**
 * Canonical form of an email address for storage and comparison: trimmed
 * and lowercased. RFC 5321 technically allows a case-sensitive local part,
 * but mainstream mail providers treat addresses case-insensitively, and
 * treating case-variants as distinct accounts would let one mailbox
 * register multiple times (e.g. `user@example.com` vs `User@example.com`).
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Email schema that normalizes (trims + lowercases) at parse time, so any
 * payload validated with it carries the canonical form of the address.
 */
export const normalizedEmailSchema = z.string().trim().toLowerCase().email();

export default normalizeEmail;
