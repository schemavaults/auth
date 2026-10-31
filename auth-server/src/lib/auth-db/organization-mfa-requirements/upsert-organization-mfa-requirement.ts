import "server-only";
import type { OrganizationID } from "@schemavaults/auth-common";
import type { Transaction } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import { getOrganizationMfaRequirement } from "./get-organization-mfa-requirement";
import { assertOrganizationId, assertUid } from "./shared";
import type { OrganizationMfaRequirement } from "./types";

export interface UpsertOrganizationMfaRequirementParams {
  organization_id: OrganizationID;
  grace_period_days: number;
  actor_uid: string;
  now: number;
}

export interface UpsertOrganizationMfaRequirementResult {
  requirement: OrganizationMfaRequirement;
  /** True when the organization did not require MFA before this call. */
  newly_required: boolean;
}

/**
 * Makes the organization require MFA, or changes the grace period of an
 * existing requirement (`required_since` and the grace periods already
 * running are kept: a new length applies to grace periods started later).
 * Locks the organization row, so concurrent calls for the same organization
 * are serialized; run it in a transaction. The caller checks that the
 * organization exists and is not a system organization.
 */
export async function upsertOrganizationMfaRequirement(
  trx: Transaction<AuthDatabase>,
  { organization_id, grace_period_days, actor_uid, now }: UpsertOrganizationMfaRequirementParams,
): Promise<UpsertOrganizationMfaRequirementResult> {
  assertOrganizationId(organization_id);
  assertUid(actor_uid);

  await trx
    .selectFrom("organizations")
    .where("organization_id", "=", organization_id)
    .select("organization_id")
    .forUpdate()
    .executeTakeFirstOrThrow();

  const existing = await getOrganizationMfaRequirement(trx, organization_id);
  if (existing) {
    await trx
      .updateTable("organization_mfa_requirements")
      .set({ grace_period_days, updated_at: now, updated_by: actor_uid })
      .where("organization_id", "=", organization_id)
      .execute();
    return {
      requirement: { ...existing, grace_period_days, updated_at: now, updated_by: actor_uid },
      newly_required: false,
    };
  }

  const requirement: OrganizationMfaRequirement = {
    organization_id,
    grace_period_days,
    required_since: now,
    updated_at: now,
    updated_by: actor_uid,
  };
  await trx.insertInto("organization_mfa_requirements").values(requirement).execute();
  return { requirement, newly_required: true };
}
