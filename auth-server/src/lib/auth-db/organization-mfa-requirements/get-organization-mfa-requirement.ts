import "server-only";
import type { OrganizationID } from "@schemavaults/auth-common";
import { assertOrganizationId, toNumber, type Db } from "./shared";
import type { OrganizationMfaRequirement } from "./types";

/** The organization's MFA requirement, or null when it does not require MFA. */
export async function getOrganizationMfaRequirement(
  db: Db,
  organization_id: OrganizationID,
): Promise<OrganizationMfaRequirement | null> {
  assertOrganizationId(organization_id);
  const row = await db
    .selectFrom("organization_mfa_requirements")
    .where("organization_id", "=", organization_id)
    .selectAll()
    .executeTakeFirst();
  if (!row) return null;
  return {
    organization_id: row.organization_id,
    grace_period_days: Number(row.grace_period_days),
    required_since: toNumber(row.required_since),
    updated_at: toNumber(row.updated_at),
    updated_by: row.updated_by,
  };
}
