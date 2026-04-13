import type { Generated, Insertable, Selectable } from "@schemavaults/dbh";
import { z } from "zod";

export const emailVerificationTokenRecordSchema = z
  .object({
    token_id: z.string().uuid(),
    uid: z.string().uuid(),
    token_hash: z.string().min(1),
    expires_at: z.number().positive(),
    used_at: z.number().positive().nullable().optional(),
    created_at: z.number().positive(),
  })
  .strict();

export type EmailVerificationTokenRecord = z.infer<typeof emailVerificationTokenRecordSchema>;

export type EmailVerificationTokensTable = EmailVerificationTokenRecord & {
  token_id: Generated<string>;
};

export type EmailVerificationToken = Selectable<EmailVerificationTokensTable>;
export type NewEmailVerificationToken = Insertable<EmailVerificationTokensTable>;
