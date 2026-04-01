import type { Generated, Insertable, Selectable } from "@schemavaults/dbh";
import { z } from "zod";

export const passwordResetTokenRecordSchema = z
  .object({
    token_id: z.string().uuid(),
    uid: z.string().uuid(),
    token_hash: z.string().min(1),
    expires_at: z.number().positive(),
    used_at: z.number().positive().nullable().optional(),
    created_at: z.number().positive(),
  })
  .strict();

export type PasswordResetTokenRecord = z.infer<typeof passwordResetTokenRecordSchema>;

export type PasswordResetTokensTable = PasswordResetTokenRecord & {
  token_id: Generated<string>;
};

export type PasswordResetToken = Selectable<PasswordResetTokensTable>;
export type NewPasswordResetToken = Insertable<PasswordResetTokensTable>;
