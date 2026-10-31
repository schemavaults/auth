import "server-only";
import { assertUid, type Db } from "./shared";

/** Ends the user's grace periods (they enrolled a factor). Resolves to how many ended. */
export async function clearOrganizationMfaGracePeriodsForUser(db: Db, uid: string): Promise<number> {
  assertUid(uid);
  const result = await db
    .deleteFrom("organization_mfa_grace_periods")
    .where("uid", "=", uid)
    .executeTakeFirst();
  return Number(result?.numDeletedRows ?? 0);
}
