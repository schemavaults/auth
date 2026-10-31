import "server-only";
import type { Db } from "./shared";

/**
 * Deletes the grace periods that no longer apply: the user enrolled a
 * factor since, or is no longer a member of the organization. Resolves to
 * how many were deleted.
 */
export async function deleteStaleOrganizationMfaGracePeriods(db: Db): Promise<number> {
  const result = await db
    .deleteFrom("organization_mfa_grace_periods as g")
    .where((eb) =>
      eb.or([
        eb.exists(
          eb
            .selectFrom("user_mfa_factors as f")
            .select("f.factor_id")
            .whereRef("f.uid", "=", "g.uid")
            .where("f.verified", "=", true),
        ),
        eb.not(
          eb.exists(
            eb
              .selectFrom("organization_membership_roles as m")
              .select("m.uid")
              .whereRef("m.organization_id", "=", "g.organization_id")
              .whereRef("m.uid", "=", "g.uid"),
          ),
        ),
      ]),
    )
    .executeTakeFirst();
  return Number(result?.numDeletedRows ?? 0);
}
