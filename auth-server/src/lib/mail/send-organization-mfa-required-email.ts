import "server-only";
import {
  getAppEnvironment,
  getAuthServerUrl,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import type { OrganizationID } from "@schemavaults/auth-common";
import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import type { RedisCache } from "@/lib/redis";
import getAuthServerFriendlyName from "@/lib/config/auth-server-friendly-name";
import type { OrganizationMfaGracePeriodReason } from "@/lib/organization-mfa-requirements/policy";
import sendEmailViaMailServer from "./send-email-via-mail-server";

export interface SendOrganizationMfaRequiredEmailOptions {
  db: Kysely<AuthDatabase>;
  redis: RedisCache;
  to: string;
  organization_id: OrganizationID;
  organization_name: string;
  reason: OrganizationMfaGracePeriodReason;
  /** End of the member's grace period (Unix epoch milliseconds). */
  grace_period_ends_at: number;
  environment?: SchemaVaultsAppEnvironment;
}

/**
 * Send the mail server's `organization-mfa-required` email: the organization
 * requires multi-factor authentication, the recipient has none, and they
 * will be removed from the organization unless they enable it before their
 * grace period ends. Throws when the mail server refuses the email.
 */
export async function sendOrganizationMfaRequiredEmail({
  db,
  redis,
  to,
  organization_id,
  organization_name,
  reason,
  grace_period_ends_at,
  environment = getAppEnvironment(),
}: SendOrganizationMfaRequiredEmailOptions): Promise<void> {
  const authServerUri: string = getAuthServerUrl(environment);
  const subject: string =
    reason === "mfa_removed"
      ? `Multi-factor authentication is required to stay in ${organization_name}`
      : `${organization_name} now requires multi-factor authentication`;

  await sendEmailViaMailServer(
    {
      to,
      subject,
      message: {
        template_id: "organization-mfa-required",
        template_props: {
          organizationName: organization_name,
          gracePeriodEndsAt: new Date(grace_period_ends_at).toISOString(),
          enableMfaUrl: `${authServerUri}/mfa`,
          reason,
          organizationUrl: `${authServerUri}/orgs/${organization_id}`,
          productName: getAuthServerFriendlyName(),
        },
      },
    },
    db,
    redis,
    environment,
  );
}

export default sendOrganizationMfaRequiredEmail;
