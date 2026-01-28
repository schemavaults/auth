import "server-only";
import { type InviteCode, type InviteCodeDefinition, inviteCodeDefinitionSchema, inviteCodeFormatSchema } from "@schemavaults/auth-common";
import type { Kysely, Transaction } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";

export async function lookupInviteCode(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
  invite_code: InviteCode,
  debug: boolean = false
): Promise<InviteCodeDefinition | null> {
  if (debug) {
    console.log(`[lookupInviteCode] lookupInviteCode("${invite_code}")`);
  }

  if (typeof invite_code !== "string") {
    throw new TypeError("Invalid format for invite code; expected a string!");
  }

  const parsedInviteCode =
    await inviteCodeFormatSchema.safeParseAsync(invite_code);
  if (!parsedInviteCode.success) {
    if (debug) {
      console.error(
        "Invalid format for 'lookup_code' to perform database lookup: ",
        parsedInviteCode.error,
      );
    } else {
      console.error(
        "Invalid format for 'lookup_code' to perform database lookup!",
      );
    }

    throw new Error(
      "Invalid format for 'lookup_code' to perform database lookup!",
    );
  }
  const INVITE_CODE: InviteCode = parsedInviteCode.data satisfies string;

  if (INVITE_CODE !== invite_code) {
    throw new Error(
      "Parsing of invite code using 'inviteCodeFormatSchema' appears to have modified the invite code value somehow!",
    );
  }

  if (debug) {
    console.log(
      `[lookupInviteCode] lookupInviteCode("${INVITE_CODE}") | Invite code appears to be semantically valid! (but still need to check if it actually exists...)`,
    );
  }

  console.assert(
    typeof INVITE_CODE === "string" && !!INVITE_CODE,
    "Expected invite code to have been confirmed to be in a valid format if this point was reached!",
  );

  const lookupQuery = db
    .selectFrom("invite_codes")
    .where("invite_code", "=", INVITE_CODE)
    .selectAll()
    .limit(1);

  let inviteCodeDefinition: InviteCodeDefinition | undefined;
  try {
    inviteCodeDefinition = await lookupQuery.executeTakeFirst();
  } catch (e: unknown) {
    console.error("Failed to run query for invite code on database: ", e);
    throw new Error("Failed to run query for invite code on database!");
  }

  if (!inviteCodeDefinition) {
    if (debug) {
      console.log(
        `[lookupInviteCode] lookupInviteCode("${INVITE_CODE}") -> Not Found!`,
      );
    }
    return null;
  }

  const parsed = await inviteCodeDefinitionSchema.safeParseAsync({
    ...inviteCodeDefinition,
    created_at:
      typeof inviteCodeDefinition.created_at === "number"
        ? inviteCodeDefinition.created_at
        : Number.parseInt(inviteCodeDefinition.created_at),
    max_uses:
      typeof inviteCodeDefinition.max_uses === "number"
        ? inviteCodeDefinition.max_uses
        : Number.parseInt(inviteCodeDefinition.max_uses),
    created_by:
      typeof inviteCodeDefinition.created_by === "string"
        ? inviteCodeDefinition.created_by
        : undefined,
  } satisfies InviteCodeDefinition);
  if (!parsed.success) {
    console.error(
      "Parsed invalid invite code definition from database: ",
      parsed.error,
    );
    throw new Error("Parsed invalid invite code definition from database!");
  }
  const INVITE_CODE_DEFINITION: InviteCodeDefinition = parsed.data;

  if (debug) {
    console.log(
      `[lookupInviteCode] lookupInviteCode("${INVITE_CODE}") = ${JSON.stringify(INVITE_CODE_DEFINITION)}`,
    );
  }

  return INVITE_CODE_DEFINITION;
}

export default lookupInviteCode;
