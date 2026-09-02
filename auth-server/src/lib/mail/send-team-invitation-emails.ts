import "server-only";
import {
  getAppEnvironment,
  getAuthServerUrl,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import { OrganizationsRegistry } from "@/lib/auth-db/organizations/organizations-registry";
import { getUserByUID } from "@/lib/auth-db/users/get-user-by-uid";
import type { OrganizationID } from "@schemavaults/auth-common";
import sendEmailViaMailServer from "./send-email-via-mail-server";
import type { RedisCache } from "@/lib/redis";
import getAuthServerFriendlyName from "@/lib/config/auth-server-friendly-name";

interface SendTeamInvitationEmailOptions {
  db: Kysely<AuthDatabase>;
  redis: RedisCache,
  organization_id: OrganizationID;
  inviter_uid: string;
  invitee_uid: string;
}

/**
 * Send the `team-invitation` email to the invitee after a new organization
 * invitation row has been persisted. Looks up organization name and user
 * emails internally so callers need only pass identifiers.
 */
export async function sendTeamInvitationEmail({
  db,
  redis,
  organization_id,
  inviter_uid,
  invitee_uid,
}: SendTeamInvitationEmailOptions): Promise<void> {
  const appEnv: SchemaVaultsAppEnvironment = getAppEnvironment();
  const authServerUri: string = getAuthServerUrl(appEnv);
  const acceptInviteUrl: string = `${authServerUri}/account`;

  const registry = new OrganizationsRegistry(db);
  const [org, inviter, invitee] = await Promise.all([
    registry.lookupOrganization(organization_id),
    getUserByUID(db, inviter_uid),
    getUserByUID(db, invitee_uid),
  ]);

  if (!inviter) {
    throw new Error(`Inviter ${inviter_uid} not found`);
  }
  if (!invitee) {
    throw new Error(`Invitee ${invitee_uid} not found`);
  }

  const friendlyName: string = getAuthServerFriendlyName();

  await sendEmailViaMailServer(
    {
      to: invitee.email,
      subject: `You've been invited to join ${org.name} on ${friendlyName}`,
      message: {
        template_id: "team-invitation",
        template_props: {
          inviterName: inviter.email,
          inviterEmail: inviter.email,
          inviteeName: invitee.email,
          teamName: org.name,
          acceptInviteUrl,
          productName: friendlyName,
        },
      },
    },
    db,
    redis
  );
}

interface SendTeamInvitationAcceptedEmailOptions {
  db: Kysely<AuthDatabase>;
  redis: RedisCache;
  organization_id: OrganizationID;
  inviter_uid: string;
  accepter_uid: string;
}

/**
 * Send the `team-invitation-accepted` email to the inviter after an
 * invitation is successfully accepted.
 */
export async function sendTeamInvitationAcceptedEmail({
  db,
  redis,
  organization_id,
  inviter_uid,
  accepter_uid,
}: SendTeamInvitationAcceptedEmailOptions): Promise<void> {
  const appEnv: SchemaVaultsAppEnvironment = getAppEnvironment();
  const authServerUri: string = getAuthServerUrl(appEnv);
  const teamUrl: string = `${authServerUri}/orgs/${organization_id}`;

  const registry = new OrganizationsRegistry(db);
  const [org, inviter, accepter] = await Promise.all([
    registry.lookupOrganization(organization_id),
    getUserByUID(db, inviter_uid),
    getUserByUID(db, accepter_uid),
  ]);

  if (!inviter) {
    throw new Error(`Inviter ${inviter_uid} not found`);
  }
  if (!accepter) {
    throw new Error(`Accepter ${accepter_uid} not found`);
  }

  await sendEmailViaMailServer(
    {
      to: inviter.email,
      subject: `${accepter.email} joined ${org.name}`,
      message: {
        template_id: "team-invitation-accepted",
        template_props: {
          inviterName: inviter.email,
          accepterName: accepter.email,
          accepterEmail: accepter.email,
          teamName: org.name,
          teamUrl,
          acceptedAt: new Date().toISOString(),
          productName: getAuthServerFriendlyName(),
        },
      },
    },
    db,
    redis
  );
}
