import "server-only";
import type { OrganizationID } from "@schemavaults/auth-common";
import { getOrganizationMfaRequirement } from "./get-organization-mfa-requirement";
import type { Db } from "./shared";
import { userHasVerifiedMfaFactor } from "./user-has-verified-mfa-factor";

/**
 * Whether the organization requires MFA and the user has no verified
 * factor: the check that refuses them membership (accepting an invitation,
 * a platform administrator's direct assignment).
 */
export async function wouldJoiningViolateOrganizationMfaRequirement(
  db: Db,
  organization_id: OrganizationID,
  uid: string,
): Promise<boolean> {
  const [requirement, has_mfa] = await Promise.all([
    getOrganizationMfaRequirement(db, organization_id),
    userHasVerifiedMfaFactor(db, uid),
  ]);
  return requirement !== null && !has_mfa;
}
