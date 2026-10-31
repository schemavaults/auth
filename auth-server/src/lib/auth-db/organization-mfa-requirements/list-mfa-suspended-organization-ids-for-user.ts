import "server-only";
import type { OrganizationID } from "@schemavaults/auth-common";
import { assertUid, type Db } from "./shared";

/**
 * The organizations whose membership the user lost the use of: their grace
 * period ended and they still have no verified factor. Membership listings
 * leave these out until the enforcement job removes the membership rows.
 */
export async function listMfaSuspendedOrganizationIdsForUser(
  db: Db,
  uid: string,
  now: number,
): Promise<readonly OrganizationID[]> {
  assertUid(uid);
  const rows = await db
    .selectFrom("organization_mfa_grace_periods as g")
    .where("g.uid", "=", uid)
    .where("g.ends_at", "<=", now)
    .where((eb) =>
      eb.not(
        eb.exists(
          eb
            .selectFrom("user_mfa_factors as f")
            .select("f.factor_id")
            .whereRef("f.uid", "=", "g.uid")
            .where("f.verified", "=", true),
        ),
      ),
    )
    .select("g.organization_id")
    .execute();
  return rows.map((row) => row.organization_id);
}
