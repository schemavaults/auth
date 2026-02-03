import "server-only";

import type { Kysely, Transaction } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import countUserRealMemberships from "./count-user-real-memberships";
import { MAXIMUM_USER_ORGANIZATIONS } from "@schemavaults/auth-common";

export async function hasUserExceededMaximumOrgMemberships(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
  uid: string,
  max_user_organizations: number = MAXIMUM_USER_ORGANIZATIONS
): Promise<boolean> {
  const currentMembershipCount: number = await countUserRealMemberships(db, uid);
  if (typeof currentMembershipCount !== 'number' || isNaN(currentMembershipCount)) {
    throw new TypeError("Expected result of countUserRealMemberships to be a number!")
  }
  return currentMembershipCount >= max_user_organizations;
}
