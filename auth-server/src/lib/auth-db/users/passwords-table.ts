import type { Generated, Insertable, Selectable } from "@schemavaults/dbh";
import { z } from "zod";

export const passwordRecordSchema = z
  .object({
    password_id: z.string().uuid(),
    uid: z.string().uuid(),
    password: z.string().min(32), // password hash
    password_hash_version: z.number().int().positive(), // 1 = legacy global-salt, 2 = per-user uid-salt
    created_at: z.number().nonnegative(),
  })
  .required({
    password_id: true,
    uid: true,
    password: true,
    password_hash_version: true,
    created_at: true,
  })
  .strict();

export type PasswordRecord = z.infer<typeof passwordRecordSchema>;

export type PasswordsTable = PasswordRecord & {
  password_id: Generated<string>;
};

export type Password = Selectable<PasswordsTable>;
export type NewPassword = Insertable<PasswordsTable>;
