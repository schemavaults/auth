import "server-only";
import type { Kysely, Transaction } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import { type PasswordRecord, passwordRecordSchema } from "./passwords-table";

async function loadPasswordRecord(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
  uid: string,
  debug: boolean = false
): Promise<PasswordRecord | null> {
  if (debug) {
    console.log(
      `[loadPasswordRecord] Loading password for user with uid: "${uid}"`,
    );
  }

  let rows: PasswordRecord[];
  try {
    rows = await db
      .selectFrom("passwords")
      .where("uid", "=", uid)
      .selectAll()
      .execute();
  } catch (e: unknown) {
    console.error(
      "Failed to look up password record for user with specified UID: ",
      e,
    );
    throw new Error(
      "Failed to look up password record for user with specified UID!",
    );
  }
  if (rows.length === 0) {
    return null;
  } else if (rows.length > 1) {
    throw new Error("Multiple passwords found with the same uid");
  }
  console.assert(
    rows.length === 1,
    "Expected exactly 1 password record row to have been retrieved by the database if this point was reached!",
  );

  const row = rows[0]!;
  const parsed_password_record = await passwordRecordSchema.safeParseAsync({
    ...row,
    created_at:
      typeof row.created_at === "number"
        ? row.created_at
        : parseInt(row.created_at as string),
  });
  if (!parsed_password_record.success) {
    console.error(parsed_password_record.error.errors);
    throw new Error("Failed to parse password record from database");
  }
  return parsed_password_record.data;
}

export async function getPasswordHash(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
  uid: string,
  debug: boolean = false
): Promise<string> {
  try {
    const password_record = await loadPasswordRecord(db, uid, debug);
    if (!password_record) {
      console.error("No password record found for that uid");
      throw new Error("Failed to find a password hash for that user ID");
    }
    const password_hash: string = password_record.password;
    if (typeof password_hash !== "string") {
      throw new Error("Expected password hash to be a string!");
    }
    return password_hash;
  } catch (e: unknown) {
    console.error("Failed to retrieve password hash: ", e);
    throw new Error("Failed to retrieve password hash");
  }
}

export default getPasswordHash;
