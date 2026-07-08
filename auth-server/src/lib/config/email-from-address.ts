import "server-only";
import { z } from "zod";
import maybeStripQuotes from "@/lib/maybeStripQuotes";

const emailAddressSchema = z.string().email();

/**
 * @description Resolves the "from" address for transactional email sent by
 * this auth server deployment from the
 * SCHEMAVAULTS_AUTH_SERVER_EMAIL_FROM_ADDRESS environment variable, so
 * white-label deployments can send mail as their own sender identity (e.g.
 * "auth@acmecorp.com"). Must be a plain email address (no display name) —
 * the mail-server's send schema only accepts a bare address. Returns
 * undefined when unset (the mail-server then applies its own default
 * sender); an invalid value is ignored with a warning rather than breaking
 * every outgoing email.
 */
export function getAuthServerEmailFromAddress(): string | undefined {
  const from_address: string | undefined = maybeStripQuotes(
    process.env.SCHEMAVAULTS_AUTH_SERVER_EMAIL_FROM_ADDRESS,
  );
  if (typeof from_address !== "string" || from_address.length === 0) {
    return undefined;
  }
  const parsed = emailAddressSchema.safeParse(from_address);
  if (!parsed.success) {
    console.warn(
      `[getAuthServerEmailFromAddress] Ignoring invalid SCHEMAVAULTS_AUTH_SERVER_EMAIL_FROM_ADDRESS value (expected a plain email address): "${from_address}"`,
    );
    return undefined;
  }
  return parsed.data;
}

export default getAuthServerEmailFromAddress;
