import "server-only";
import type { OrganizationID } from "@schemavaults/auth-common";
import { assertOrganizationId, type Db } from "./shared";

/**
 * Stops requiring MFA. Every grace period of the organization goes with the
 * requirement (ON DELETE CASCADE). Resolves to false when it was not required.
 */
export async function deleteOrganizationMfaRequirement(
  db: Db,
  organization_id: OrganizationID,
): Promise<boolean> {
  assertOrganizationId(organization_id);
  const result = await db
    .deleteFrom("organization_mfa_requirements")
    .where("organization_id", "=", organization_id)
    .executeTakeFirst();
  return (result?.numDeletedRows ?? BigInt(0)) > BigInt(0);
}
