import "server-only";
import type { Kysely, Transaction } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import { parseUserDocument, type UserDocument } from "./parse-user-document";

export async function listUsersCreatedSince(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
  since_ms: number,
): Promise<readonly UserDocument[]> {
  const rows = await db
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
    .where("created_at", ">", since_ms)
    .orderBy("created_at", "desc")
    .execute();

  const parsed: UserDocument[] = [];
  for (const row of rows) {
    parsed.push(await parseUserDocument(row));
  }
  return parsed;
}

export default listUsersCreatedSince;
