import "server-only";

import { randomBytes } from "node:crypto";

/**
 * @description A fresh verification token for a domain registration: 128
 * random bits as 32 lowercase hex characters (the same shape migration
 * 00057 backfilled existing rows with). Not a secret — its owner publishes
 * it in DNS — but unguessable, so nobody else's registration can match a
 * record published for this one.
 */
export function generateDomainVerificationToken(): string {
  return randomBytes(16).toString("hex");
}

export default generateDomainVerificationToken;
