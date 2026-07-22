import "server-only";
import type { Kysely, Transaction } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import type { InviteCodeDefinition } from "@schemavaults/auth-common";
import { areValidInviteCodeDefinitions } from "./validate-invite-code-definition";

export async function listAllInviteCodes(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
  debug: boolean = false
): Promise<readonly InviteCodeDefinition[]> {
  if (debug) {
    console.log("[listAllInviteCodes] listAllInviteCodes()");
  }

  try {
    const allInviteCodesQuery = db
      .selectFrom("invite_codes")
      .selectAll();
    const allInviteCodesRaw = await allInviteCodesQuery.execute();
    const allInviteCodesParsed = allInviteCodesRaw.map((raw_invite_code) => {
      const withParsedFields = {
        ...raw_invite_code,
        created_at:
          typeof raw_invite_code.created_at === "number"
            ? raw_invite_code.created_at
            : Number.parseInt(raw_invite_code.created_at),
        max_uses:
          typeof raw_invite_code.max_uses === "number"
            ? raw_invite_code.max_uses
            : Number.parseInt(raw_invite_code.max_uses),
        created_by:
          typeof raw_invite_code.created_by === "string"
            ? raw_invite_code.created_by
            : undefined,
        description:
          typeof raw_invite_code.description === "string"
            ? raw_invite_code.description
            : undefined,
      };
      if (!withParsedFields.created_by) {
        delete withParsedFields.created_by;
      }
      if (!withParsedFields.description) {
        delete withParsedFields.description;
      }

      return withParsedFields;
    });
    if (!areValidInviteCodeDefinitions(allInviteCodesParsed)) {
      throw new Error(
        "Failed to parse invite code definitions from database!",
      );
    }

    if (debug) {
      console.log(
        `[listAllInviteCodes] listAllInviteCodes() = ${allInviteCodesParsed.length} invite codes`,
      );
    }

    return allInviteCodesParsed;
  } catch (e: unknown) {
    console.error(
      "Failed to load invite code definitions from database: ",
      e,
    );
    throw new Error("Failed to load invite code definitions from database!");
  }
}

export default listAllInviteCodes;
