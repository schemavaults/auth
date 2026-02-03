import "server-only";

import isValidUuid from "@/lib/is-valid-uuid";
import type { Kysely, Transaction } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";

export async function countUserRealMemberships(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
  uid: string,
  debug: boolean = false
): Promise<number> {
  if (typeof uid !== 'string' || !isValidUuid(uid)) {
    throw new Error(
      "OrganizationsRegistry.countUserRealMemberships() received invalid user ID!",
    );
  }

  if (debug) {
    console.log(
      `[OrganizationsRegistry] countUserRealMemberships(uid = '${uid}')`,
    );
  }

  try {
    const countQuery = db
      .selectFrom("organization_membership_roles")
      .where("uid", "=", uid)
      .select((eb) => eb.fn.countAll().as("count"));

    const result = await countQuery.executeTakeFirstOrThrow();
    const count = typeof result.count === "bigint"
      ? Number(result.count)
      : typeof result.count === "string"
        ? Number.parseInt(result.count)
        : result.count;

    if (debug) {
      console.log(
        `[OrganizationsRegistry] countUserRealMemberships(uid = '${uid}') => ${count}`,
      );
    }

    return count;
  } catch (e: unknown) {
    console.error(
      `Failed to count organization memberships for user '${uid}': `,
      e,
    );
    throw new Error(
      `Failed to count organization memberships for user '${uid}'!`,
    );
  }
}

export default countUserRealMemberships;
