import "server-only";
import type { Kysely } from "@schemavaults/dbh";
import type Redis from "ioredis";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import {
  DEFAULT_SERVICE_ACCOUNT_EMAIL_DOMAIN,
  getServerSetting,
  serviceAccountEmailDomainSchema,
} from "@/lib/auth-db/server-settings";

export { DEFAULT_SERVICE_ACCOUNT_EMAIL_DOMAIN };

/**
 * The domain of service-account emails (`<app_id>@<domain>`), from the
 * `service_account_email_domain` server setting. Defaults to the
 * reserved `service-accounts.invalid`; admins may point it at a domain
 * they control (e.g. `service-accounts.auth.example.com`).
 */
export async function getServiceAccountEmailDomain(
  db: Kysely<AuthDatabase>,
  redis?: Redis,
): Promise<string> {
  const setting_key = "service_account_email_domain" as const;
  try {
    const value = await getServerSetting(setting_key, db, redis);
    const parsed = serviceAccountEmailDomainSchema.safeParse(value);
    if (!parsed.success) {
      throw new TypeError(
        `Expected a valid email domain, received: ${JSON.stringify(value)}`,
      );
    }
    return parsed.data;
  } catch (e: unknown) {
    console.error(`Error loading server config setting '${setting_key}': `, e);
    throw new Error(`Error loading server config setting: '${setting_key}'`);
  }
}

/**
 * Every domain that is reserved for service accounts: the configured one
 * plus the built-in default (so switching the setting never unreserves
 * the default, under which earlier service accounts may still exist).
 */
export async function getReservedServiceAccountEmailDomains(
  db: Kysely<AuthDatabase>,
  redis?: Redis,
): Promise<readonly string[]> {
  const configured: string = await getServiceAccountEmailDomain(db, redis);
  return Array.from(
    new Set<string>([configured, DEFAULT_SERVICE_ACCOUNT_EMAIL_DOMAIN]),
  );
}

/**
 * Whether `email` belongs to one of the service-account domains, i.e.
 * must never be registered, claimed, or otherwise used by a human
 * account. Domains compare case-insensitively (the mailbox part is
 * irrelevant); an email without exactly one `@` is never reserved.
 */
export function isReservedServiceAccountEmail(
  email: string,
  reserved_domains: readonly string[],
): boolean {
  if (typeof email !== "string") {
    return false;
  }
  const at: number = email.lastIndexOf("@");
  if (at < 0 || at !== email.indexOf("@")) {
    return false;
  }
  const domain: string = email.slice(at + 1).trim().toLowerCase();
  if (domain.length === 0) {
    return false;
  }
  return reserved_domains.some(
    (reserved) => reserved.trim().toLowerCase() === domain,
  );
}

/**
 * Thrown when someone tries to create a human account under a domain
 * reserved for service accounts. Surfaced as a 400 by the register
 * endpoint.
 */
export class ReservedEmailDomainError extends Error {
  public constructor(public readonly email_domain: string) {
    super(
      `The email domain '${email_domain}' is reserved for service accounts and cannot be used to register an account`,
    );
    this.name = "ReservedEmailDomainError";
  }
}

export const RESERVED_EMAIL_DOMAIN_MESSAGE =
  "This email domain is reserved for service accounts. Please register with a different email address.";
