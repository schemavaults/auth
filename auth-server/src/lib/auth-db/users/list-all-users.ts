import "server-only";
import type { Kysely, Transaction } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import { parseUserDocument, type UserDocument } from "./parse-user-document";

export async function listAllUsers(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
  debug: boolean = false
): Promise<readonly UserDocument[]> {
  if (debug) {
    console.log("[listAllUsers] listAllUsers()");
  }

  try {
    const allUsersQuery = db
      .selectFrom("users")
      .select([
        "email",
        "email_verified",
        "admin",
        "created_at",
        "disabled",
        "invite_code",
        "uid",
      ])
      .orderBy("created_at", "desc");

    const allUsersRaw = await allUsersQuery.execute();
    const allUsersParsed: UserDocument[] = [];

    for (const raw_user of allUsersRaw) {
      const parsed_user = await parseUserDocument(raw_user);
      allUsersParsed.push(parsed_user);
    }

    if (debug) {
      console.log(
        `[listAllUsers] listAllUsers() = ${allUsersParsed.length} users`,
      );
    }

    return allUsersParsed;
  } catch (e: unknown) {
    console.error("Failed to load users from database: ", e);
    throw new Error("Failed to load users from database!");
  }
}

export default listAllUsers;
