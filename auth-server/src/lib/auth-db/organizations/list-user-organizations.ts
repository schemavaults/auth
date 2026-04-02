import "server-only";
import type { OrganizationID } from "@schemavaults/auth-common";
import type { Kysely, Transaction } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import { listUserOrganizationMemberships } from "./list-user-organization-memberships";

export async function listUserOrganizations(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
  uid: string,
  admin: boolean = false,
  debug: boolean = false,
): Promise<readonly OrganizationID[]> {
  const memberships = await listUserOrganizationMemberships(db, uid, admin, debug);
  return [...new Set(memberships.map((membership) => membership.organization_id))];
}

export default listUserOrganizations;
