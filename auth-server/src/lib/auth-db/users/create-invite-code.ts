import "server-only";
import type { Kysely, Transaction } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import type { InviteCodeDefinition } from "@schemavaults/auth-common";
import loadSuperuserInviteCode from "@/lib/SuperuserInviteCode";
import { isValidInviteCodeDefinition } from "./validate-invite-code-definition";

export async function createInviteCode(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
  invite_code_def: InviteCodeDefinition,
  debug: boolean = false
): Promise<void> {
  if (debug) {
    console.log(
      `[createInviteCode] createInviteCode(${JSON.stringify(invite_code_def)})`,
    );
  }

  if (!isValidInviteCodeDefinition(invite_code_def)) {
    throw new Error(
      "Invalid invite code definition to insert into database!",
    );
  }

  const superuserInviteCode: string | undefined = loadSuperuserInviteCode();
  const isSuperuserCode: boolean = typeof superuserInviteCode === 'string' ? superuserInviteCode === invite_code_def.invite_code : false;
  if (!isSuperuserCode && !invite_code_def.created_by) {
    throw new Error("A 'created_by' field must be set for each invite code definition.")
  }

  const insertInviteCodeQuery = db
    .insertInto("invite_codes")
    .values(invite_code_def satisfies InviteCodeDefinition);

  try {
    await insertInviteCodeQuery.execute();
  } catch (e: unknown) {
    console.error("Failed to insert invite code into database: ", e);
    throw new Error("Failed to insert invite code into database!");
  }
}

export default createInviteCode;
