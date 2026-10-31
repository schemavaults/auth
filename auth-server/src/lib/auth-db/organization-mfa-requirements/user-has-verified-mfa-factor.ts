import "server-only";
import { assertUid, type Db } from "./shared";

/** Whether the user has at least one verified MFA factor. */
export async function userHasVerifiedMfaFactor(db: Db, uid: string): Promise<boolean> {
  assertUid(uid);
  const row = await db
    .selectFrom("user_mfa_factors")
    .select("factor_id")
    .where("uid", "=", uid)
    .where("verified", "=", true)
    .limit(1)
    .executeTakeFirst();
  return !!row;
}
