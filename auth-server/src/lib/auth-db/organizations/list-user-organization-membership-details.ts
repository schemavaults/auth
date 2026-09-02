import "server-only";
import type { Kysely, Transaction } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import {
  organizationMembershipRoleDetailsSchema,
  type OrganizationMembershipRoleDetails,
} from "@schemavaults/auth-common";
import { listUserOrganizationMemberships } from "./list-user-organization-memberships";
import { OrganizationsRegistry } from "./organizations-registry";

export interface ListUserOrganizationMembershipDetailsOptions {
  uid: string;
  /**
   * Whether the user is a server admin. Admins receive a virtual membership
   * in the owner organization in addition to their database memberships.
   */
  admin?: boolean;
  /**
   * Called for each membership whose organization could not be enriched
   * (e.g. the organization row failed to load). The membership is dropped
   * from the result; the remaining memberships are still returned.
   */
  onEnrichmentFailure?: (
    organization_id: string,
    reason: unknown,
  ) => void | Promise<void>;
}

/**
 * List the organizations a user belongs to, enriched with each
 * organization's display name and timestamps, in the
 * `OrganizationMembershipRoleDetails` shape consumed by the client-side
 * `useMyOrganizations()` hook. Used to SSR-preload the `/account`, `/orgs`,
 * and `/admin/organizations` pages.
 */
export async function listUserOrganizationMembershipDetails(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
  {
    uid,
    admin = false,
    onEnrichmentFailure,
  }: ListUserOrganizationMembershipDetailsOptions,
): Promise<readonly OrganizationMembershipRoleDetails[]> {
  const memberships = await listUserOrganizationMemberships(db, uid, admin);

  const organizationsRegistry = new OrganizationsRegistry(db);

  const enrichedResults = await Promise.allSettled(
    memberships.map(
      async (membership): Promise<OrganizationMembershipRoleDetails> => {
        const orgDef = await organizationsRegistry.lookupOrganization(
          membership.organization_id,
        );
        const parsed =
          await organizationMembershipRoleDetailsSchema.safeParseAsync({
            organization_id: membership.organization_id,
            organization_name: orgDef.name,
            role: membership.role,
            created_at: orgDef.created_at,
            joined_at: membership.created_at,
          });
        if (!parsed.success) {
          throw new Error(
            `Failed to validate OrganizationMembershipRoleDetails for organization "${membership.organization_id}": ${parsed.error.message}`,
          );
        }
        return parsed.data;
      },
    ),
  );

  const details: OrganizationMembershipRoleDetails[] = [];
  for (const [i, result] of enrichedResults.entries()) {
    if (result.status === "fulfilled") {
      details.push(result.value);
    } else {
      const organization_id: string =
        memberships[i]?.organization_id ?? "unknown";
      if (onEnrichmentFailure) {
        await onEnrichmentFailure(organization_id, result.reason);
      } else {
        console.error(
          `Failed to load OrganizationMembershipRoleDetails for organization ${organization_id}:`,
          result.reason,
        );
      }
    }
  }

  return details;
}

export default listUserOrganizationMembershipDetails;
