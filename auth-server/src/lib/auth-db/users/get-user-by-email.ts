import "server-only";
import type { Kysely, Transaction } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import { parseUserDocument, type UserDocument } from "./parse-user-document";

export async function getUserByEmail(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
  email: string,
  debug: boolean = false
): Promise<UserDocument | null> {
  if (debug) {
    console.log("[getUserByEmail] getUserByEmail: ", email);
  }

  let rows: unknown[];
  try {
    rows = await db
      .selectFrom("users")
      .where("email", "=", email)
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
    throw new Error("Failed to query for user by email");
  }
  if (!Array.isArray(rows))
    throw new Error("Expected select result to be an array");

  if (rows.length === 0) {
    return null;
  } else if (rows.length > 1) {
    throw new Error("Multiple users found with the same email");
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
    console.error(e);
    throw new Error(
      "Failed to parse user document when getting user by email from user registry",
    );
  }

  if (debug) {
    console.log("[getUserByEmail] getUserByEmail success:", parsed_user);
  }

  return parsed_user;
}

export default getUserByEmail;
