import "server-only";
import { z } from "zod";
import { inviteCodeFormatSchema } from "@schemavaults/auth-common";

export const userDocumentSchema = z
  .object({
    email: z.string().email(),
    email_verified: z.boolean().optional(),
    uid: z.string().uuid(),
    created_at: z.number().nonnegative(),
    invite_code: inviteCodeFormatSchema.optional(),
    admin: z.boolean().optional(),
    disabled: z.boolean().optional(),
  })
  .required({
    email: true,
    uid: true,
    created_at: true,
  })
  .strict();

export type UserDocument = z.infer<typeof userDocumentSchema>;

export async function parseUserDocument(row: unknown): Promise<UserDocument> {
  if (typeof row !== "object" || !row) {
    throw new Error("Invalid row type from DB");
  }

  if (!Object.hasOwn(row, "created_at")) {
    throw new Error(
      "Invalid user document from DB; missing created_at property",
    );
  }
  const parsed_user = await userDocumentSchema.safeParseAsync({
    ...row,
    created_at: parseInt((row as { created_at: string }).created_at),
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
