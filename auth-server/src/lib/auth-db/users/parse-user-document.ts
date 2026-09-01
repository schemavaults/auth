import "server-only";
import { z } from "zod";
import {
  inviteCodeFormatSchema,
  userDisplayNameSchema,
  userNamePartSchema,
  usernameFormatSchema,
} from "@schemavaults/auth-common";

export const userDocumentSchema = z
  .object({
    email: z.string().email(),
    email_verified: z.boolean().optional(),
    uid: z.string().uuid(),
    created_at: z.number().nonnegative(),
    invite_code: inviteCodeFormatSchema.optional(),
    admin: z.boolean().optional(),
    disabled: z.boolean().optional(),
    tokens_valid_after: z.number().nonnegative().optional(),
    // User-editable profile name fields (migration 00036); absent when
    // never set. Writes are validated by updateUserProfile, so reads
    // apply the same shared format schemas.
    username: usernameFormatSchema.optional(),
    first_name: userNamePartSchema.optional(),
    middle_name: userNamePartSchema.optional(),
    last_name: userNamePartSchema.optional(),
    display_name: userDisplayNameSchema.optional(),
  })
  .required({
    email: true,
    uid: true,
    created_at: true,
  })
  .strict();

export type UserDocument = z.infer<typeof userDocumentSchema>;

/**
 * The USERS columns that are nullable in Postgres but surfaced as
 * `string | undefined` on UserDocument: NULL is normalized to the
 * absent-key form before schema validation.
 */
const NULLABLE_TEXT_COLUMNS = [
  "invite_code",
  "username",
  "first_name",
  "middle_name",
  "last_name",
  "display_name",
] as const;

export async function parseUserDocument(row: unknown): Promise<UserDocument> {
  if (typeof row !== "object" || !row) {
    throw new Error("Invalid row type from DB");
  }

  if (!Object.hasOwn(row, "created_at")) {
    throw new Error(
      "Invalid user document from DB; missing created_at property",
    );
  }
  const rawRow = row as Record<string, unknown>;
  const rawTokensValidAfter = rawRow.tokens_valid_after;
  const tokens_valid_after: number | undefined =
    rawTokensValidAfter === undefined || rawTokensValidAfter === null
      ? undefined
      : typeof rawTokensValidAfter === "string"
        ? parseInt(rawTokensValidAfter, 10)
        : Number(rawTokensValidAfter);

  const normalizedRow: Record<string, unknown> = { ...rawRow };
  for (const column of NULLABLE_TEXT_COLUMNS) {
    if (normalizedRow[column] === null) {
      delete normalizedRow[column];
    }
  }

  const parsed_user = await userDocumentSchema.safeParseAsync({
    ...normalizedRow,
    created_at: parseInt((row as { created_at: string }).created_at),
    ...(tokens_valid_after === undefined ? {} : { tokens_valid_after }),
  });
  if (!parsed_user.success) {
    console.error(
      "[parseUserDocument]",
      parsed_user.error.errors,
    );
    throw new Error("Failed to parse user from database");
  }
  return parsed_user.data;
}

export default parseUserDocument;
