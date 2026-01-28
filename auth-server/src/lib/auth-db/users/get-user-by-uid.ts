import "server-only";
import type { Kysely, Transaction } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import { parseUserDocument, type UserDocument } from "./parse-user-document";

export async function getUserByUID(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
  uid: string,
  debug: boolean = false
): Promise<UserDocument | null> {
  if (debug) {
    console.log("[getUserByUID] getUserByUID: ", uid);
  }

  let rows: unknown[];
  try {
    rows = await db
      .selectFrom("users")
      .where("uid", "=", uid)
      .limit(5)
      .select([
        "email",
        "email_verified",
        "admin",
        "created_at",
        "disabled",
        "invite_code",
        "uid",
      ])
      .execute();
  } catch (e: unknown) {
    console.error(e);
    throw new Error("Failed to query for user by uid");
  }
  if (rows.length === 0) {
    return null;
  } else if (rows.length > 1) {
    console.error(`Multiple users found with the same uid`);
    throw new Error("Multiple users found with the same uid");
  }

  if (!rows[0]) return null;
  if (typeof rows[0] === "object" && Object.keys(rows[0]).length === 0) {
    return null;
  }

  if (typeof rows[0] !== "object")
    throw new Error("Expected user document to be an object");

  let parsed_user: UserDocument;
  try {
    parsed_user = await parseUserDocument(rows[0]);
  } catch (e: unknown) {
    console.error("[getUserByUID]", e);
    throw new Error(
      "Failed to parse user document when getting user by uid from user registry",
    );
  }

  if (debug) {
    console.log("[getUserByUID] getUserByUID result: ", parsed_user);
  }

  return parsed_user;
}

export default getUserByUID;
