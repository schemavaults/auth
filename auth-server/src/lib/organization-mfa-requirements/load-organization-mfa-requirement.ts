import "server-only";
import type { OrganizationID } from "@schemavaults/auth-common";
import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import {
  getOrganizationMfaRequirement,
  listOrganizationMembersWithoutMfa,
  userHasVerifiedMfaFactor,
} from "@/lib/auth-db/organization-mfa-requirements";
import { getOrganizationMfaComplianceStatus } from "./policy";
import type { OrganizationMfaRequirementView } from "./types";

/**
 * The organization's MFA requirement as the API answers it and the
 * organization page renders it. `members_without_mfa` is only loaded for
 * `include_members` (owners and platform administrators); null otherwise.
 */
export async function loadOrganizationMfaRequirementView(
  db: Kysely<AuthDatabase>,
  {
    organization_id,
    caller_uid,
    include_members,
  }: { organization_id: OrganizationID; caller_uid: string; include_members: boolean },
): Promise<OrganizationMfaRequirementView> {
  const now: number = Date.now();
  const [requirement, caller_has_mfa] = await Promise.all([
    getOrganizationMfaRequirement(db, organization_id),
    userHasVerifiedMfaFactor(db, caller_uid),
  ]);
  const members = requirement && include_members ? await listOrganizationMembersWithoutMfa(db, organization_id) : [];
  return {
    organization_id,
    required: requirement !== null,
    grace_period_days: requirement?.grace_period_days ?? null,
    required_since: requirement?.required_since ?? null,
    updated_at: requirement?.updated_at ?? null,
    caller_has_mfa,
    members_without_mfa: include_members
      ? members.map((member) => ({
          uid: member.uid,
          email: member.email,
          role: member.role,
          membership_created_at: member.membership_created_at,
          status: getOrganizationMfaComplianceStatus(member.grace_period?.ends_at ?? null, now),
          grace_period_reason: member.grace_period?.reason ?? null,
          grace_period_ends_at: member.grace_period?.ends_at ?? null,
          notified_at: member.grace_period?.notified_at ?? null,
        }))
      : null,
  };
}

export default loadOrganizationMfaRequirementView;
