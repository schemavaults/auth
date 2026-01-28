import "server-only";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import { type InviteCode, inviteCodeFormatSchema } from "@schemavaults/auth-common";
import type { Kysely, Transaction } from "@schemavaults/dbh";

export async function countInviteCodeUsages(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
  invite_code: InviteCode,
  debug: boolean = false
): Promise<number> {
  if (debug) {
    console.log(`[UserRegistry] countInviteCodeUsages("${invite_code}")`);
  }
  const parsedInviteCode =
    await inviteCodeFormatSchema.safeParseAsync(invite_code);
  if (!parsedInviteCode.success) {
    if (debug) {
      console.error(
        "Invalid format for 'lookup_code' to count usages for: ",
        parsedInviteCode.error,
      );
    } else {
      console.error("Invalid format for 'lookup_code' to count usages for!");
    }

    throw new Error("Invalid format for 'lookup_code' to count usages for!");
  }

  let count: number;
  try {
    const countUsagesQuery = db
      .selectFrom("users")
      .where("invite_code", "=", parsedInviteCode.data)
      .select(db.fn.countAll().as("count"));

    const countUsages = await countUsagesQuery.executeTakeFirstOrThrow();
    const rowCount: string | number | bigint = countUsages.count;
    if (typeof rowCount === "number") {
      count = rowCount;
    } else if (typeof rowCount === "bigint") {
      count = Number(rowCount);
    } else if (typeof rowCount === "string") {
      const parsedCountInt = Number.parseInt(rowCount);
      if (isNaN(parsedCountInt)) {
        throw new Error(
          "Failed to parse # of invite code usages as an integer!",
        );
      }
      count = parsedCountInt;
    } else {
      throw new Error(
        `Received unexpected datatype '${typeof rowCount}' when attempting to count invite code usages!`,
      );
    }
  } catch (e: unknown) {
    console.error(
      "Failed to count number of usages for invite code in database: ",
      e,
    );
    throw new Error(
      "Failed to count number of usages for invite code in database!",
    );
  }

  if (debug) {
    console.log(
      `[UserRegistry] countInviteCodeUsages("${invite_code}") = ${count}`,
    );
  }

  return count;
}

export default countInviteCodeUsages;
