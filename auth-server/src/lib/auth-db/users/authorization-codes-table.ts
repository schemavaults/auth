import type { Insertable, Selectable } from "@schemavaults/dbh";
import { z } from "zod";

export const authorizationCodeRecordSchema = z
  .object({
    authorization_code: z.string(),
    uid: z.string().uuid(),
    code_challenge: z.string().min(43),
    code_challenge_method: z.literal("S256"),
    challenge_time: z.number().nonnegative(),
    created_at: z.number().nonnegative(),
  })
  .required({
    authorization_code: true,
    uid: true,
    code_challenge: true,
    code_challenge_method: true,
    challenge_time: true,
    created_at: true,
  })
  .strict();

export type AuthorizationCodeRecord = z.infer<
  typeof authorizationCodeRecordSchema
>;

export type AuthorizationCodesTable = AuthorizationCodeRecord;

export type AuthorizationCode = Selectable<AuthorizationCodesTable>;
export type NewAuthorizationCode = Insertable<AuthorizationCodesTable>;
