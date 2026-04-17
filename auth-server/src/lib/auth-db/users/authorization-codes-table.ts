import type { Insertable, Selectable } from "@schemavaults/dbh";
import { appIdSchema } from "@schemavaults/app-definitions";
import { z } from "zod";

export const authorizationCodeRecordSchema = z
  .object({
    authorization_code: z.string(),
    uid: z.string().uuid(),
    client_app_id: appIdSchema,
    code_challenge: z.string().min(43),
    code_challenge_method: z.literal("S256"),
    challenge_time: z.number().nonnegative(),
    created_at: z.number().nonnegative(),
    expires_at: z.number().positive(),
    used_at: z.number().positive().nullable().optional(),
  })
  .required({
    authorization_code: true,
    uid: true,
    client_app_id: true,
    code_challenge: true,
    code_challenge_method: true,
    challenge_time: true,
    created_at: true,
    expires_at: true,
  })
  .strict();

export type AuthorizationCodeRecord = z.infer<
  typeof authorizationCodeRecordSchema
>;

export type AuthorizationCodesTable = AuthorizationCodeRecord;

export type AuthorizationCode = Selectable<AuthorizationCodesTable>;
export type NewAuthorizationCode = Insertable<AuthorizationCodesTable>;
